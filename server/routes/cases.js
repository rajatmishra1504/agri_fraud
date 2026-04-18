const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.post('/',
  authenticateToken,
  authorizeRoles('fraud_analyst', 'admin'),
  auditLog('CREATE_CASE', 'case'),
  async (req, res) => {
    try {
      const { flag_id, priority, notes } = req.body;
      const caseNumber = `CASE-${Date.now().toString().slice(-8)}`;

      const flagResult = await pool.query(
        `SELECT ff.id, ff.batch_id, b.region as batch_region
         FROM fraud_flags ff
         LEFT JOIN batches b ON ff.batch_id = b.id
         WHERE ff.id = $1`,
        [flag_id]
      );

      if (flagResult.rows.length === 0) {
        return res.status(404).json({ error: 'Flag not found' });
      }

      const batchRegion = String(flagResult.rows[0].batch_region || '').trim();
      let assignedAnalystId = req.user.id;

      if (batchRegion) {
        const analystResult = await pool.query(
          `SELECT u.id
           FROM users u
           LEFT JOIN fraud_cases fc ON fc.assigned_to = u.id AND fc.decision = 'PENDING'
           WHERE u.role = 'fraud_analyst'
             AND u.is_active = true
             AND COALESCE(LOWER(TRIM(u.region)), '') = LOWER(TRIM($1))
           GROUP BY u.id
           ORDER BY COUNT(fc.id) ASC, u.created_at ASC
           LIMIT 1`,
          [batchRegion]
        );

        if (analystResult.rows.length > 0) {
          assignedAnalystId = analystResult.rows[0].id;
        }
      }
      
      const result = await pool.query(`
        INSERT INTO fraud_cases (
          flag_id, case_number, assigned_to, priority, notes
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [flag_id, caseNumber, assignedAnalystId, priority, notes]);
      
      await pool.query(
        `UPDATE fraud_flags SET status = 'INVESTIGATING' WHERE id = $1`,
        [flag_id]
      );
      
      res.status(201).json({
        message: 'Case created successfully',
        case: result.rows[0]
      });
    } catch (error) {
      console.error('Create case error:', error);
      res.status(500).json({ error: 'Failed to create case' });
    }
  }
);

router.post('/:id/close',
  authenticateToken,
  authorizeRoles('fraud_analyst', 'admin'),
  auditLog('CLOSE_CASE', 'case'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { decision, decision_reason } = req.body;
      
      const result = await pool.query(`
        UPDATE fraud_cases
        SET decision = $1, decision_reason = $2, closed_at = NOW(), closed_by = $3
        WHERE id = $4
        RETURNING *
      `, [decision, decision_reason, req.user.id, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Case not found' });
      }
      
      const caseData = result.rows[0];
      
      await pool.query(
        `UPDATE fraud_flags SET status = 'CLOSED' WHERE id = $1`,
        [caseData.flag_id]
      );
      
      res.json({
        message: 'Case closed successfully',
        case: caseData
      });
    } catch (error) {
      console.error('Close case error:', error);
      res.status(500).json({ error: 'Failed to close case' });
    }
  }
);

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fc.*, ff.flag_type, ff.severity, ff.description,
            b.batch_number, b.region as batch_region, u.name as analyst_name, u.region as analyst_region
      FROM fraud_cases fc
      LEFT JOIN fraud_flags ff ON fc.flag_id = ff.id
      LEFT JOIN batches b ON ff.batch_id = b.id
      LEFT JOIN users u ON fc.assigned_to = u.id
      ORDER BY fc.created_at DESC
    `);
    
    res.json({ cases: result.rows });
  } catch (error) {
    console.error('Get cases error:', error);
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
});

module.exports = router;
