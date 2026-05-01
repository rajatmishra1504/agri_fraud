// routes/report.js — Role-specific report generation
const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/report/me — returns report data based on logged-in user's role
router.get('/me', authenticateToken, async (req, res) => {
  const { id: userId, role } = req.user;

  try {
    let data = {};

    if (role === 'farmer') {
      const yieldsRes = await pool.query(
        `SELECT fy.batch_number, fy.crop_name, fy.farm_location, fy.region,
                fy.quantity_kg, fy.batch_unit, fy.harvest_date, fy.status,
                fy.issue_raised, fy.created_at,
                fi.quality_grade, fi.price_per_unit, fi.total_price,
                fi.inspection_notes, fi.inspected_at, fi.status AS inspection_status
         FROM farmer_yields fy
         LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
         WHERE fy.farmer_id = $1
         ORDER BY fy.created_at DESC`,
        [userId]
      );
      const rows = yieldsRes.rows;
      data = {
        role,
        title: 'Farmer Activity Report',
        summary: {
          total_yields: rows.length,
          inspected: rows.filter(r => r.inspection_status === 'COMPLETED').length,
          pending: rows.filter(r => r.status === 'PENDING').length,
          issues_raised: rows.filter(r => r.issue_raised).length,
          total_quantity_kg: rows.reduce((s, r) => s + parseFloat(r.quantity_kg || 0), 0).toFixed(2),
          total_revenue: rows.reduce((s, r) => s + parseFloat(r.total_price || 0), 0).toFixed(2),
        },
        records: rows,
      };
    }

    else if (role === 'inspector') {
      const inspRes = await pool.query(
        `SELECT fi.*, fy.batch_number, fy.crop_name, fy.farm_location, fy.quantity_kg,
                u.name AS farmer_name
         FROM farm_inspections fi
         JOIN farmer_yields fy ON fy.id = fi.yield_id
         JOIN users u ON u.id = fy.farmer_id
         WHERE fi.inspector_id = $1
         ORDER BY fi.inspected_at DESC`,
        [userId]
      );
      const rows = inspRes.rows;
      const gradeCount = {};
      rows.forEach(r => { gradeCount[r.quality_grade] = (gradeCount[r.quality_grade] || 0) + 1; });
      data = {
        role,
        title: 'Inspector Activity Report',
        summary: {
          total_inspections: rows.length,
          completed: rows.filter(r => r.status === 'COMPLETED').length,
          grade_breakdown: gradeCount,
          avg_price_per_unit: rows.length
            ? (rows.reduce((s, r) => s + parseFloat(r.price_per_unit || 0), 0) / rows.length).toFixed(2)
            : '0.00',
        },
        records: rows,
      };
    }

    else if (role === 'transporter') {
      const shipRes = await pool.query(
        `SELECT s.*, b.batch_number, b.product_type, b.farm_location
         FROM shipments s
         LEFT JOIN batches b ON b.id = s.batch_id
         WHERE s.transporter_id = $1
         ORDER BY s.created_at DESC`,
        [userId]
      );
      const rows = shipRes.rows;
      data = {
        role,
        title: 'Transporter Activity Report',
        summary: {
          total_shipments: rows.length,
          delivered: rows.filter(r => r.status === 'DELIVERED').length,
          in_transit: rows.filter(r => r.status === 'IN_TRANSIT').length,
          pending: rows.filter(r => r.status === 'PENDING').length,
          cancelled: rows.filter(r => r.status === 'CANCELLED').length,
          total_weight_kg: rows.reduce((s, r) => s + parseFloat(r.weight_kg || 0), 0).toFixed(2),
        },
        records: rows,
      };
    }

    else if (role === 'buyer') {
      const orderRes = await pool.query(
        `SELECT po.*, b.batch_number, b.product_type, b.farm_location, b.quality_grade
         FROM purchase_orders po
         LEFT JOIN batches b ON b.id = po.batch_id
         WHERE po.buyer_id = $1
         ORDER BY po.created_at DESC`,
        [userId]
      );
      const rows = orderRes.rows;
      data = {
        role,
        title: 'Buyer Activity Report',
        summary: {
          total_orders: rows.length,
          fulfilled: rows.filter(r => r.status === 'FULFILLED').length,
          approved: rows.filter(r => r.status === 'APPROVED').length,
          pending: rows.filter(r => r.status === 'REQUESTED').length,
          rejected: rows.filter(r => r.status === 'REJECTED').length,
          cancelled: rows.filter(r => r.status === 'CANCELLED').length,
          total_quantity_kg: rows.reduce((s, r) => s + parseFloat(r.requested_quantity_kg || 0), 0).toFixed(2),
        },
        records: rows,
      };
    }

    else if (role === 'godown') {
      const [yieldsRes, stockRes] = await Promise.all([
        pool.query(
          `SELECT fy.batch_number, fy.crop_name, fy.quantity_kg, fy.batch_unit,
                  fy.status, fy.created_at, u.name AS farmer_name,
                  fi.quality_grade, fi.price_per_unit, fi.total_price
           FROM farmer_yields fy
           JOIN users u ON u.id = fy.farmer_id
           LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
           WHERE fy.godown_id = $1
           ORDER BY fy.created_at DESC`,
          [userId]
        ),
        pool.query(
          `SELECT fy.crop_name,
                  COALESCE(SUM(fy.quantity_kg),0) AS total_received_kg,
                  COALESCE(SUM(COALESCE((
                    SELECT SUM(po.requested_quantity_kg) FROM purchase_orders po
                    JOIN batches b2 ON b2.id = po.batch_id
                    JOIN farmer_yields fy2 ON fy2.batch_id = b2.id
                    WHERE fy2.id = fy.id AND po.status IN ('REQUESTED','APPROVED','FULFILLED')
                  ),0)),0) AS sold_kg
           FROM farmer_yields fy
           WHERE fy.godown_id = $1 AND fy.status = 'INSPECTED'
           GROUP BY fy.crop_name`,
          [userId]
        ),
      ]);
      const rows = yieldsRes.rows;
      const totalReceived = rows.reduce((s, r) => s + parseFloat(r.quantity_kg || 0), 0);
      const totalSold = stockRes.rows.reduce((s, r) => s + parseFloat(r.sold_kg || 0), 0);
      data = {
        role,
        title: 'Godown Activity Report',
        summary: {
          total_yields: rows.length,
          inspected: rows.filter(r => r.status === 'INSPECTED').length,
          pending: rows.filter(r => r.status === 'PENDING').length,
          total_received_kg: totalReceived.toFixed(2),
          total_sold_kg: totalSold.toFixed(2),
          stock_remaining_kg: (totalReceived - totalSold).toFixed(2),
        },
        records: rows,
      };
    }

    else if (role === 'fraud_analyst') {
      const [flagsRes, casesRes] = await Promise.all([
        pool.query(
          `SELECT ff.*, b.batch_number, b.product_type
           FROM fraud_flags ff
           LEFT JOIN batches b ON b.id = ff.batch_id
           ORDER BY ff.created_at DESC
           LIMIT 200`
        ),
        pool.query(
          `SELECT fc.*, u.name AS assigned_name,
                  ff.flag_type, ff.severity
           FROM fraud_cases fc
           LEFT JOIN users u ON u.id = fc.assigned_to
           LEFT JOIN fraud_flags ff ON ff.id = fc.flag_id
           WHERE fc.assigned_to = $1 OR $1 IN (
             SELECT id FROM users WHERE role = 'fraud_analyst'
           )
           ORDER BY fc.created_at DESC
           LIMIT 200`,
          [userId]
        ),
      ]);
      const flags = flagsRes.rows;
      const cases = casesRes.rows;
      data = {
        role,
        title: 'Fraud Analyst Report',
        summary: {
          total_flags: flags.length,
          open_flags: flags.filter(f => f.status === 'OPEN').length,
          investigating: flags.filter(f => f.status === 'INVESTIGATING').length,
          closed_flags: flags.filter(f => f.status === 'CLOSED').length,
          high_critical: flags.filter(f => ['HIGH', 'CRITICAL'].includes(f.severity)).length,
          total_cases: cases.length,
          fraud_decisions: cases.filter(c => c.decision === 'FRAUD').length,
          cleared_decisions: cases.filter(c => c.decision === 'NOT_FRAUD').length,
          pending_cases: cases.filter(c => c.decision === 'PENDING').length,
        },
        flags,
        cases,
      };
    }

    else if (role === 'admin') {
      const [usersRes, batchesRes, shipmentsRes, flagsRes, ordersRes] = await Promise.all([
        pool.query(`SELECT role, COUNT(*) AS count FROM users GROUP BY role`),
        pool.query(`SELECT quality_grade, COUNT(*) AS count, SUM(quantity_kg) AS total_kg FROM batches WHERE COALESCE(is_deleted,false)=false GROUP BY quality_grade`),
        pool.query(`SELECT status, COUNT(*) AS count FROM shipments GROUP BY status`),
        pool.query(`SELECT severity, status, COUNT(*) AS count FROM fraud_flags GROUP BY severity, status`),
        pool.query(`SELECT status, COUNT(*) AS count FROM purchase_orders GROUP BY status`),
      ]);
      data = {
        role,
        title: 'Admin System Report',
        summary: {
          users_by_role: usersRes.rows,
          batches_by_grade: batchesRes.rows,
          shipments_by_status: shipmentsRes.rows,
          flags_breakdown: flagsRes.rows,
          orders_by_status: ordersRes.rows,
        },
      };
    }

    else {
      return res.status(403).json({ error: 'Unknown role for report' });
    }

    res.json({ report: data, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
