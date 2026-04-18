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
    
    // Check for expiration (e.g., 180 days)
    const issueDate = new Date(cert.issued_at);
    const currentDate = new Date();
    const daysSinceIssue = Math.floor((currentDate - issueDate) / (1000 * 60 * 60 * 24));
    const isExpired = daysSinceIssue > 180;

    // Determine the invalidity reason if applicable
    let invalidReason = null;
    if (!cert.is_valid) {
      invalidReason = cert.revoke_reason || 'Certificate has been manually revoked by the issuing authority.';
    } else if (isExpired) {
      invalidReason = `Certificate expired: Valid for 180 days (issued ${daysSinceIssue} days ago).`;
    } else if (hasFraudFlags) {
      invalidReason = 'Warning: This batch has been flagged for potential fraud and is under investigation.';
    }

    await pool.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, metadata, ip_address)
       VALUES ('VERIFY_CERTIFICATE', 'certificate', $1, $2, $3)`,
      [cert.id, JSON.stringify({ qr_code: qrCode }), req.ip]
    );
    
    res.json({
      valid: cert.is_valid && !hasFraudFlags && !isExpired,
      certificate: cert,
      invalid_reason: invalidReason,
      age_days: daysSinceIssue,
      warnings: hasFraudFlags ? ['This batch has ongoing fraud investigations'] : [],
      fraud_flag_count: cert.fraud_flag_count
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
