const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const crypto = require('crypto');
const QRCode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fraudDetection = require('../services/fraudDetection');

// Configure multer for PDF uploads
const fs = require('fs');
const baseUploadDir = process.env.UPLOADS_PATH 
    ? path.resolve(process.env.UPLOADS_PATH) 
    : path.join(__dirname, '../../uploads');

const uploadDir = path.join(baseUploadDir, 'certificates');

function resolveFileUrl(req, filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${req.protocol}://${req.get('host')}${normalizedPath}`;
}

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `cert-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    if (!file || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  }
});

// Issue certificate
router.post('/',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  (req, res, next) => {
    upload.single('pdf')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  auditLog('ISSUE_CERTIFICATE', 'certificate'),
  async (req, res) => {
    try {
      const { batch_id, inspector_notes } = req.body;
      
      if (!batch_id) {
        return res.status(400).json({ error: 'Batch ID is required' });
      }
      
      // Verify batch exists
      const batchResult = await pool.query(
        'SELECT * FROM batches WHERE id = $1 AND COALESCE(is_deleted, false) = false',
        [batch_id]
      );
      if (batchResult.rows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      
      // Generate certificate number and hash
      const certNumber = `CERT-${batch_id}-${Date.now()}`;
      let pdfUrl = req.file ? `/uploads/certificates/${req.file.filename}` : null;
      
      // Create certificate hash from batch data + timestamp
      const hashData = `${batch_id}-${certNumber}-${Date.now()}`;
      const certHash = crypto.createHash('sha256').update(hashData).digest('hex');
      
      // Generate QR code data
      const qrData = crypto.randomBytes(16).toString('hex');
      const qrLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${qrData}`;
      const qrCodeUrl = await QRCode.toDataURL(qrLink);

      // ✅ AUTOMATIC PDF GENERATION (If no file uploaded)
      const { generateCertificatePdf } = require('../utils/pdfGenerator');
      let localPdfPath = req.file ? path.join(uploadDir, req.file.filename) : null;

      if (!localPdfPath) {
        const autoPdfName = `auto-${certNumber}.pdf`;
        localPdfPath = path.join(uploadDir, autoPdfName);
        
        await generateCertificatePdf({
            cert_number: certNumber,
            batch_number: batchResult.rows[0].batch_number,
            product_type: batchResult.rows[0].product_type,
            farm_name: batchResult.rows[0].farm_name,
            farm_location: batchResult.rows[0].farm_location,
            quantity_kg: batchResult.rows[0].quantity_kg,
            batch_unit: batchResult.rows[0].batch_unit,
            quality_grade: batchResult.rows[0].quality_grade,
            inspector_notes: inspector_notes,
            inspector_name: req.user.name
        }, qrCodeUrl, localPdfPath);
      }

      // ✅ UPLOAD TO CLOUDINARY FOR PERMANENCY
      const { uploadToCloudinary } = require('../utils/cloudinary');
      try {
        const cloudinaryUrl = await uploadToCloudinary(localPdfPath, 'certificates');
        pdfUrl = cloudinaryUrl; // Overwrite local path with permanent cloud URL
      } catch (uploadErr) {
        console.error('Cloudinary upload fallback:', uploadErr);
        // If Cloudinary fails, we keep the pdfUrl as the local path (ephemeral)
        pdfUrl = req.file ? `/uploads/certificates/${req.file.filename}` : `/uploads/certificates/${path.basename(localPdfPath)}`;
      }
      
      const result = await pool.query(`
        INSERT INTO certificates (
          batch_id, cert_number, cert_hash, pdf_url, qr_code, inspector_notes, issued_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [batch_id, certNumber, certHash, pdfUrl, qrData, inspector_notes || '', req.user.id]);
      
      // Real-time Excessive Certificates fraud check
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM certificates WHERE batch_id = $1 AND is_valid = true',
        [batch_id]
      );
      if (parseInt(countResult.rows[0].count) > 5) {
        console.log(`⚠️ Excessive certificates detected for Batch #${batch_id}. Triggering fraud scan...`);
        // Trigger specific detection for this batch
        await fraudDetection.detectExcessiveCertificates();
      }
      
      res.status(201).json({
        message: 'Certificate issued successfully',
        certificate: {
          ...result.rows[0],
          qr_code_image: qrCodeUrl,
          certificate_pdf_url: resolveFileUrl(req, result.rows[0].pdf_url)
        }
      });
    } catch (error) {
      console.error('Issue certificate error:', error);
      res.status(500).json({ 
        error: 'Failed to issue certificate',
        details: error.message 
      });
    }
  }
);

// Get all certificates
// Get all certificates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { batch_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT c.*, b.batch_number, b.product_type, b.farm_name,
             u.name as inspector_name
      FROM certificates c
      LEFT JOIN batches b ON c.batch_id = b.id
      LEFT JOIN users u ON c.issued_by = u.id
    `;

    const params = [];

    if (batch_id) {
      query += ` WHERE c.batch_id = $1`;
      params.push(batch_id);
    }

    query += `
      ORDER BY c.issued_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    // ✅ generate QR image for each certificate
    const certificatesWithQR = await Promise.all(
      result.rows.map(async (cert) => {
        const qrImage = await QRCode.toDataURL(
          `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify/${cert.qr_code}`
        );

        return {
          ...cert,
          qr_code_image: qrImage,
          certificate_pdf_url: resolveFileUrl(req, cert.pdf_url)
        };
      })
    );

    res.json({
      certificates: certificatesWithQR,
      count: certificatesWithQR.length
    });

  } catch (error) {
    console.error('Get certificates error:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});


// Get certificate by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT c.*, b.*, u.name as inspector_name, u.email as inspector_email
      FROM certificates c
      LEFT JOIN batches b ON c.batch_id = b.id
      LEFT JOIN users u ON c.issued_by = u.id
      WHERE c.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    // Generate QR code image
    const qrCodeUrl = await QRCode.toDataURL(
      `${process.env.FRONTEND_URL}/verify/${result.rows[0].qr_code}`
    );
    
    res.json({
      ...result.rows[0],
      qr_code_image: qrCodeUrl,
      certificate_pdf_url: resolveFileUrl(req, result.rows[0].pdf_url)
    });
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

// Revoke certificate
router.post('/:id/revoke',
  authenticateToken,
  authorizeRoles('inspector', 'fraud_analyst', 'admin'),
  auditLog('REVOKE_CERTIFICATE', 'certificate'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const result = await pool.query(`
        UPDATE certificates
        SET is_valid = false, revoked_at = NOW(), revoked_by = $1, revoke_reason = $2
        WHERE id = $3
        RETURNING *
      `, [req.user.id, reason, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Certificate not found' });
      }
      
      res.json({
        message: 'Certificate revoked successfully',
        certificate: result.rows[0]
      });
    } catch (error) {
      console.error('Revoke certificate error:', error);
      res.status(500).json({ error: 'Failed to revoke certificate' });
    }
  }
);

module.exports = router;
