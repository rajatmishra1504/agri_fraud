const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const fraudEngine = require('../services/fraudDetection');


const NodeCache = require('node-cache');
const dashboardCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

// Get fraud dashboard stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const cachedStats = dashboardCache.get('fraudStats');
    if (cachedStats) {
      return res.json(cachedStats);
    }

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM fraud_flags) as total_flags,

        (SELECT COUNT(*) FROM fraud_flags 
         WHERE status = 'OPEN') as open_flags,

        (SELECT COUNT(*) FROM fraud_flags 
         WHERE status = 'INVESTIGATING') as investigating_flags,

        (SELECT COUNT(*) FROM fraud_flags 
         WHERE severity = 'HIGH' OR severity = 'CRITICAL') as high_severity,

        (
          SELECT json_object_agg(tc.flag_type, tc.type_count)
          FROM (
            SELECT flag_type, COUNT(*) as type_count
            FROM fraud_flags
            GROUP BY flag_type
          ) tc
        ) as by_type
    `);


    const recentFlags = await pool.query(`
      SELECT ff.*, b.batch_number, b.product_type
      FROM fraud_flags ff
      LEFT JOIN batches b ON ff.batch_id = b.id
      WHERE ff.status != 'CLOSED'
      ORDER BY ff.created_at DESC
      LIMIT 10
    `);


    const payload = {
      statistics: stats.rows[0],
      recent_flags: recentFlags.rows
    };
    
    dashboardCache.set('fraudStats', payload);

    res.json(payload);

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});


// Get all fraud flags
router.get('/flags', authenticateToken, async (req, res) => {
  try {

    const { status, severity, flag_type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT ff.*, b.batch_number, b.product_type, b.farm_name,
             c.cert_number, s.shipment_number,
             fc.case_number, fc.decision
      FROM fraud_flags ff
      LEFT JOIN batches b ON ff.batch_id = b.id
      LEFT JOIN certificates c ON ff.cert_id = c.id
      LEFT JOIN shipments s ON ff.shipment_id = s.id
      LEFT JOIN fraud_cases fc ON fc.flag_id = ff.id
    `;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push(`ff.status = $${params.length + 1}`);
      params.push(status);
    }

    if (severity) {
      conditions.push(`ff.severity = $${params.length + 1}`);
      params.push(severity);
    }

    if (flag_type) {
      conditions.push(`ff.flag_type = $${params.length + 1}`);
      params.push(flag_type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      ORDER BY ff.created_at DESC 
      LIMIT $${params.length + 1} 
      OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      flags: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get flags error:', error);
    res.status(500).json({ error: 'Failed to fetch fraud flags' });
  }
});


// Trigger fraud scan
router.post(
  '/scan',
  authenticateToken,
  authorizeRoles('fraud_analyst', 'admin'),
  async (req, res) => {
    try {

      const results = await fraudEngine.scanAllBatches();

      res.json({
        message: 'Fraud scan completed',
        results
      });

    } catch (error) {
      console.error('Fraud scan error:', error);
      res.status(500).json({ error: 'Fraud scan failed' });
    }
  }
);

module.exports = router;
