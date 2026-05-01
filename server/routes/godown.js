// server/routes/godown.js — Godown (Warehouse Head) role routes
const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ─── GET /api/godown/dashboard ────────────────────────────────────────────────
// Main dashboard stats for the godown head
router.get('/dashboard', authenticateToken, authorizeRoles('godown', 'admin'), async (req, res) => {
  const godownId = req.user.godown_id;

  try {
    const [
      incomingRes,
      stockRes,
      soldRes,
      bestItemRes,
      farmersRes,
      recentRes,
    ] = await Promise.all([

      // Total yields incoming to this godown
      pool.query(`
        SELECT COUNT(*) AS total_yields,
               COALESCE(SUM(fy.quantity_kg), 0) AS total_quantity_kg
        FROM farmer_yields fy
        WHERE fy.godown_id = $1
      `, [godownId]),

      // Current stock = inspected yields not yet fully sold
      pool.query(`
        SELECT COALESCE(SUM(
          fy.quantity_kg - COALESCE((
            SELECT SUM(po.requested_quantity_kg)
            FROM purchase_orders po
            JOIN batches b2 ON b2.id = po.batch_id
            JOIN farmer_yields fy2 ON fy2.batch_id = b2.id
            WHERE fy2.id = fy.id
              AND po.status IN ('REQUESTED','APPROVED','FULFILLED')
          ), 0)
        ), 0) AS stock_remaining_kg,
        COUNT(DISTINCT fy.id) AS inspected_yields
        FROM farmer_yields fy
        WHERE fy.godown_id = $1
          AND fy.status = 'INSPECTED'
      `, [godownId]),

      // Sold stock = fulfilled orders linked to this godown's yields
      pool.query(`
        SELECT COALESCE(SUM(po.requested_quantity_kg), 0) AS sold_quantity_kg,
               COUNT(DISTINCT po.id) AS fulfilled_orders
        FROM purchase_orders po
        JOIN batches b ON b.id = po.batch_id
        JOIN farmer_yields fy ON fy.batch_id = b.id
        WHERE fy.godown_id = $1
          AND po.status = 'FULFILLED'
      `, [godownId]),

      // Best selling item by quantity sold
      pool.query(`
        SELECT fy.crop_name,
               COALESCE(SUM(po.requested_quantity_kg), 0) AS sold_kg,
               COUNT(DISTINCT po.id) AS order_count
        FROM purchase_orders po
        JOIN batches b ON b.id = po.batch_id
        JOIN farmer_yields fy ON fy.batch_id = b.id
        WHERE fy.godown_id = $1
          AND po.status = 'FULFILLED'
        GROUP BY fy.crop_name
        ORDER BY sold_kg DESC
        LIMIT 5
      `, [godownId]),

      // Farmers supplying to this godown
      pool.query(`
        SELECT u.id, u.name, u.email, u.phone,
               COUNT(fy.id) AS yield_count,
               COALESCE(SUM(fy.quantity_kg), 0) AS total_kg,
               MAX(fy.created_at) AS last_submission
        FROM farmer_yields fy
        JOIN users u ON u.id = fy.farmer_id
        WHERE fy.godown_id = $1
        GROUP BY u.id, u.name, u.email, u.phone
        ORDER BY total_kg DESC
      `, [godownId]),

      // Recent 10 yields
      pool.query(`
        SELECT fy.batch_number, fy.crop_name, fy.quantity_kg, fy.batch_unit,
               fy.status, fy.created_at, fy.harvest_date,
               u.name AS farmer_name,
               fi.quality_grade, fi.price_per_unit, fi.total_price
        FROM farmer_yields fy
        JOIN users u ON u.id = fy.farmer_id
        LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
        WHERE fy.godown_id = $1
        ORDER BY fy.created_at DESC
        LIMIT 10
      `, [godownId]),
    ]);

    res.json({
      stats: {
        total_yields: parseInt(incomingRes.rows[0].total_yields),
        total_quantity_kg: parseFloat(incomingRes.rows[0].total_quantity_kg).toFixed(2),
        stock_remaining_kg: parseFloat(stockRes.rows[0].stock_remaining_kg).toFixed(2),
        inspected_yields: parseInt(stockRes.rows[0].inspected_yields),
        sold_quantity_kg: parseFloat(soldRes.rows[0].sold_quantity_kg).toFixed(2),
        fulfilled_orders: parseInt(soldRes.rows[0].fulfilled_orders),
      },
      best_items: bestItemRes.rows,
      farmers: farmersRes.rows,
      recent_yields: recentRes.rows,
    });
  } catch (err) {
    console.error('Godown dashboard error:', err);
    res.status(500).json({ error: 'Failed to load godown dashboard' });
  }
});

// ─── GET /api/godown/yields ───────────────────────────────────────────────────
// All yields assigned to this godown with full details
router.get('/yields', authenticateToken, authorizeRoles('godown', 'admin'), async (req, res) => {
  const godownId = req.user.godown_id;
  try {
    const result = await pool.query(`
      SELECT fy.*,
             u.name AS farmer_name, u.email AS farmer_email, u.phone AS farmer_phone,
             fi.quality_grade, fi.price_per_unit, fi.total_price,
             fi.inspection_notes, fi.certificate_number, fi.inspected_at,
             fi.status AS inspection_status
      FROM farmer_yields fy
      JOIN users u ON u.id = fy.farmer_id
      LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
      WHERE fy.godown_id = $1
      ORDER BY fy.created_at DESC
    `, [godownId]);
    res.json({ yields: result.rows });
  } catch (err) {
    console.error('Godown yields error:', err);
    res.status(500).json({ error: 'Failed to fetch yields' });
  }
});

// ─── GET /api/godown/stock ────────────────────────────────────────────────────
// Current stock breakdown by crop
router.get('/stock', authenticateToken, authorizeRoles('godown', 'admin'), async (req, res) => {
  const godownId = req.user.godown_id;
  try {
    const result = await pool.query(`
      SELECT fy.crop_name,
             COUNT(fy.id) AS batch_count,
             COALESCE(SUM(fy.quantity_kg), 0) AS total_received_kg,
             COALESCE(SUM(
               COALESCE((
                 SELECT SUM(po.requested_quantity_kg)
                 FROM purchase_orders po
                 JOIN batches b2 ON b2.id = po.batch_id
                 JOIN farmer_yields fy2 ON fy2.batch_id = b2.id
                 WHERE fy2.id = fy.id AND po.status IN ('REQUESTED','APPROVED','FULFILLED')
               ), 0)
             ), 0) AS sold_kg,
             COALESCE(SUM(fy.quantity_kg), 0) - COALESCE(SUM(
               COALESCE((
                 SELECT SUM(po.requested_quantity_kg)
                 FROM purchase_orders po
                 JOIN batches b2 ON b2.id = po.batch_id
                 JOIN farmer_yields fy2 ON fy2.batch_id = b2.id
                 WHERE fy2.id = fy.id AND po.status IN ('REQUESTED','APPROVED','FULFILLED')
               ), 0)
             ), 0) AS remaining_kg,
             fy.batch_unit
      FROM farmer_yields fy
      WHERE fy.godown_id = $1 AND fy.status = 'INSPECTED'
      GROUP BY fy.crop_name, fy.batch_unit
      ORDER BY remaining_kg DESC
    `, [godownId]);
    res.json({ stock: result.rows });
  } catch (err) {
    console.error('Godown stock error:', err);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

// ─── POST /api/godown/assign-yield/:yieldId ───────────────────────────────────
// Assign a yield to this godown (godown head accepts a yield)
router.post('/assign-yield/:yieldId', authenticateToken, authorizeRoles('godown', 'admin'), async (req, res) => {
  const godownId = req.user.godown_id;
  const { yieldId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE farmer_yields SET godown_id = $1, godown_name = (SELECT name FROM godowns WHERE id = $1), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [godownId, yieldId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Yield not found' });
    res.json({ message: 'Yield assigned to godown', yield: result.rows[0] });
  } catch (err) {
    console.error('Assign yield error:', err);
    res.status(500).json({ error: 'Failed to assign yield' });
  }
});

// ─── GET /api/godown/all-yields ───────────────────────────────────────────────
// All unassigned inspected yields (godown can pick up)
router.get('/all-yields', authenticateToken, authorizeRoles('godown', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fy.id, fy.batch_number, fy.crop_name, fy.quantity_kg, fy.batch_unit,
             fy.farm_location, fy.region, fy.harvest_date, fy.status, fy.godown_id,
             u.name AS farmer_name,
             fi.quality_grade, fi.price_per_unit
      FROM farmer_yields fy
      JOIN users u ON u.id = fy.farmer_id
      LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
      WHERE fy.status = 'INSPECTED'
      ORDER BY fy.created_at DESC
    `);
    res.json({ yields: result.rows });
  } catch (err) {
    console.error('All yields error:', err);
    res.status(500).json({ error: 'Failed to fetch yields' });
  }
});

module.exports = router;
