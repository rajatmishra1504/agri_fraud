const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const auditLog = require('../middleware/auditLog');

router.get('/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;
    
    const result = await pool.query(`
      SELECT c.*, b.*, u.name as inspector_name,
             (SELECT COUNT(*) FROM fraud_flags WHERE cert_id = c.id OR batch_id = c.batch_id) as fraud_flag_count
      FROM certificates c
      LEFT JOIN batches b ON c.batch_id = b.id
      LEFT JOIN users u ON c.issued_by = u.id
      WHERE c.qr_code = $1
    `, [qrCode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        valid: false,
        message: 'Certificate not found'
      });
    }
    
    const cert = result.rows[0];
    const hasFraudFlags = cert.fraud_flag_count > 0;
    
    await pool.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, metadata, ip_address)
       VALUES ('VERIFY_CERTIFICATE', 'certificate', $1, $2, $3)`,
      [cert.id, JSON.stringify({ qr_code: qrCode }), req.ip]
    );
    
    res.json({
      valid: cert.is_valid && !hasFraudFlags,
      certificate: cert,
      warnings: hasFraudFlags ? ['This batch has fraud flags'] : [],
      fraud_flag_count: cert.fraud_flag_count
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
