const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/',
  authenticateToken,
  authorizeRoles('admin', 'fraud_analyst'),
  async (req, res) => {
    try {
      const { user_id, entity_type, limit = 100, offset = 0 } = req.query;
      
      let query = `
        SELECT al.*, u.name as user_name, u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
      `;
      
      const conditions = [];
      const params = [];
      
      if (user_id) {
        conditions.push(`al.user_id = $${params.length + 1}`);
        params.push(user_id);
      }
      if (entity_type) {
        conditions.push(`al.entity_type = $${params.length + 1}`);
        params.push(entity_type);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await pool.query(query, params);
      
      res.json({ logs: result.rows });
    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

module.exports = router;
