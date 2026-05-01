// server/routes/farmer.js — updated: farmer picks godown on yield submit
// Inspector sees only yields from their godown
const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Farmer submits a crop yield batch — now includes godown_id + godown_name
router.post('/yield',
  authenticateToken,
  authorizeRoles('farmer'),
  auditLog('FARMER_SUBMIT_YIELD', 'farmer_yield'),
  async (req, res) => {
    try {
      const {
        crop_name, farm_location, region, quantity_kg,
        batch_unit, harvest_date, additional_notes,
        godown_id  // NEW
      } = req.body;

      if (!crop_name || !farm_location || !quantity_kg || !harvest_date) {
        return res.status(400).json({ error: 'crop_name, farm_location, quantity_kg and harvest_date are required' });
      }

      if (!godown_id) {
        return res.status(400).json({ error: 'godown_id is required. Please select a godown.' });
      }

      // Validate godown exists
      const godownRes = await pool.query(
        `SELECT id, name FROM users WHERE id = $1 AND role = 'godown' AND is_active = true`,
        [godown_id]
      );
      if (godownRes.rows.length === 0) {
        return res.status(400).json({ error: 'Selected godown does not exist' });
      }
      const godownName = godownRes.rows[0].name;

      const normalizedUnit = String(batch_unit || 'kg').trim().toLowerCase();
      const normalizedRegion = String(region || farm_location || '').trim();
      const batchNumber = `FARM-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;

      const result = await pool.query(`
        INSERT INTO farmer_yields (
          batch_number, farmer_id, crop_name, farm_location, region,
          quantity_kg, batch_unit, harvest_date, additional_notes, status,
          godown_id, godown_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10, $11)
        RETURNING *
      `, [
        batchNumber, req.user.id, crop_name, farm_location, normalizedRegion,
        quantity_kg, normalizedUnit, harvest_date, additional_notes || null,
        godown_id, godownName
      ]);

      res.status(201).json({
        message: `Yield submitted successfully to ${godownName}. Awaiting inspector verification.`,
        yield: result.rows[0]
      });
    } catch (error) {
      console.error('Farmer submit yield error:', error);
      res.status(500).json({ error: 'Failed to submit yield' });
    }
  }
);

// Farmer views all their yields with inspection results
router.get('/my-yields',
  authenticateToken,
  authorizeRoles('farmer'),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          fy.*,
          u_insp.name AS inspector_name,
          u_insp.email AS inspector_email,
          fi.quality_grade,
          fi.price_per_unit,
          fi.total_price,
          fi.inspection_notes,
          fi.certificate_number,
          fi.inspected_at,
          fi.status AS inspection_status,
          u_buyer.name AS buyer_name,
          u_buyer.email AS buyer_email,
          u_buyer.region AS buyer_region,
          po.requested_quantity_kg AS ordered_quantity,
          po.batch_unit AS ordered_unit,
          po.status AS order_status
        FROM farmer_yields fy
        LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
        LEFT JOIN users u_insp ON fi.inspector_id = u_insp.id
        LEFT JOIN batches b ON b.id = fy.batch_id
        LEFT JOIN LATERAL (
          SELECT po.*
          FROM purchase_orders po
          WHERE po.batch_id = b.id
          ORDER BY po.created_at DESC
          LIMIT 1
        ) po ON true
        LEFT JOIN users u_buyer ON po.buyer_id = u_buyer.id
        WHERE fy.farmer_id = $1
        ORDER BY fy.created_at DESC
      `, [req.user.id]);
      res.json({ yields: result.rows });
    } catch (error) {
      console.error('Farmer get yields error:', error);
      res.status(500).json({ error: 'Failed to fetch yields' });
    }
  }
);

// Farmer raises a fraud issue on their yield
router.post('/yield/:id/raise-issue',
  authenticateToken,
  authorizeRoles('farmer'),
  auditLog('FARMER_RAISE_ISSUE', 'farmer_yield'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { issue_description } = req.body;

      if (!issue_description || String(issue_description).trim().length < 10) {
        return res.status(400).json({ error: 'Issue description must be at least 10 characters' });
      }

      const yieldResult = await pool.query(
        `SELECT fy.*, fi.quality_grade, fi.price_per_unit
         FROM farmer_yields fy
         LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
         WHERE fy.id = $1 AND fy.farmer_id = $2`,
        [id, req.user.id]
      );

      if (yieldResult.rows.length === 0) {
        return res.status(404).json({ error: 'Yield not found or not yours' });
      }

      const yieldData = yieldResult.rows[0];

      const flagResult = await pool.query(`
        INSERT INTO fraud_flags (flag_type, severity, evidence_json, status, description)
        VALUES ('FARMER_REPORTED_ISSUE', 'MEDIUM', $1, 'OPEN', $2)
        RETURNING *
      `, [
        JSON.stringify({ yield_id: id, batch_number: yieldData.batch_number, farmer_id: req.user.id, crop_name: yieldData.crop_name, reported_issue: issue_description.trim() }),
        `Farmer reported issue on yield ${yieldData.batch_number}: ${issue_description.trim()}`
      ]);

      await pool.query(
        `UPDATE farmer_yields SET issue_raised = true, issue_description = $1, updated_at = NOW() WHERE id = $2`,
        [issue_description.trim(), id]
      );

      res.status(201).json({
        message: 'Issue raised successfully. A fraud analyst will investigate.',
        flag_id: flagResult.rows[0].id
      });
    } catch (error) {
      console.error('Farmer raise issue error:', error);
      res.status(500).json({ error: 'Failed to raise issue' });
    }
  }
);

// Public summary of completed inspections
router.get('/inspections-summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fi.price_per_unit, fi.total_price, fi.quality_grade, fy.batch_number, fy.crop_name
      FROM farm_inspections fi
      JOIN farmer_yields fy ON fy.id = fi.yield_id
      WHERE fi.status = 'COMPLETED'
      ORDER BY fi.inspected_at DESC
    `);
    res.json({ inspections: result.rows });
  } catch (error) {
    console.error('Inspections summary error:', error);
    res.status(500).json({ error: 'Failed to fetch inspections summary' });
  }
});

// Inspector: Get all pending yields — FILTERED BY INSPECTOR'S GODOWN
router.get('/pending-yields',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  async (req, res) => {
    try {
      // If admin → see all. If inspector → only their godown's yields
      const isAdmin = req.user.role === 'admin';

      // Get inspector's godown_id from DB
      let inspectorGodownId = null;
      if (!isAdmin) {
        const inspectorRes = await pool.query(`SELECT godown_id FROM users WHERE id = $1`, [req.user.id]);
        inspectorGodownId = inspectorRes.rows[0]?.godown_id || null;
      }

      const whereClause = isAdmin
        ? ''
        : inspectorGodownId
          ? `WHERE fy.godown_id = ${inspectorGodownId}`
          : `WHERE fy.godown_id IS NULL`; // show unassigned if inspector has no godown

      const result = await pool.query(`
        SELECT
          fy.*,
          u.name AS farmer_name,
          u.email AS farmer_email,
          u.phone AS farmer_phone,
          fi.quality_grade, fi.price_per_unit, fi.total_price,
          fi.inspection_notes, fi.certificate_number, fi.inspected_at,
          fi.status AS inspection_status, fi.id AS inspection_id
        FROM farmer_yields fy
        JOIN users u ON u.id = fy.farmer_id
        LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
        ${whereClause}
        ORDER BY fy.created_at DESC
      `);

      res.json({ yields: result.rows });
    } catch (error) {
      console.error('Inspector get yields error:', error);
      res.status(500).json({ error: 'Failed to fetch yields' });
    }
  }
);

// Inspector: Submit inspection result for a farmer yield
router.post('/yield/:id/inspect',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  auditLog('INSPECTOR_INSPECT_YIELD', 'farm_inspection'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { quality_grade, price_per_unit, inspection_notes } = req.body;

      if (!quality_grade || price_per_unit === undefined || price_per_unit === null || price_per_unit === '') {
        return res.status(400).json({ error: 'quality_grade and price_per_unit are required' });
      }

      const parsedPrice = Number(price_per_unit);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: 'price_per_unit must be a positive number' });
      }

      const validGrades = ['A', 'B', 'C', 'D', 'F'];
      const gradeUpper = String(quality_grade).toUpperCase().trim();
      if (!validGrades.includes(gradeUpper)) {
        return res.status(400).json({ error: 'quality_grade must be one of: A, B, C, D, F' });
      }

      const yieldResult = await client.query(
        `SELECT fy.*, u.name AS farmer_name FROM farmer_yields fy
         JOIN users u ON u.id = fy.farmer_id
         WHERE fy.id = $1`,
        [id]
      );

      if (yieldResult.rows.length === 0) {
        return res.status(404).json({ error: 'Yield not found' });
      }

      // Verify inspector belongs to the yield's godown (unless admin)
      if (req.user.role === 'inspector') {
        const inspectorRes = await client.query(`SELECT godown_id FROM users WHERE id = $1`, [req.user.id]);
        const inspectorGodownId = inspectorRes.rows[0]?.godown_id;
        const yieldGodownId = yieldResult.rows[0].godown_id;
        if (inspectorGodownId && yieldGodownId && inspectorGodownId !== yieldGodownId) {
          return res.status(403).json({ error: 'You can only inspect yields assigned to your godown' });
        }
      }

      const yieldData = yieldResult.rows[0];
      const totalPrice = parsedPrice * Number(yieldData.quantity_kg);
      const certNumber = `CERT-${yieldData.batch_number}-${Date.now().toString().slice(-6)}`;

      await client.query('BEGIN');

      // 1. Create or update farm_inspection
      const existingInspection = await client.query(
        `SELECT id FROM farm_inspections WHERE yield_id = $1`, [id]
      );

      let inspectionId;
      if (existingInspection.rows.length > 0) {
        const upd = await client.query(
          `UPDATE farm_inspections
           SET quality_grade=$1, price_per_unit=$2, total_price=$3,
               inspection_notes=$4, inspector_id=$5, inspected_at=NOW(), status='COMPLETED', updated_at=NOW()
           WHERE yield_id=$6 RETURNING id`,
          [gradeUpper, parsedPrice, totalPrice, inspection_notes || null, req.user.id, id]
        );
        inspectionId = upd.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO farm_inspections
             (yield_id, inspector_id, quality_grade, price_per_unit, total_price, inspection_notes, certificate_number, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'COMPLETED') RETURNING id`,
          [id, req.user.id, gradeUpper, parsedPrice, totalPrice, inspection_notes || null, certNumber]
        );
        inspectionId = ins.rows[0].id;
      }

      // 2. Update farmer_yield status
      await client.query(
        `UPDATE farmer_yields SET status='INSPECTED', updated_at=NOW() WHERE id=$1`, [id]
      );

      // 3. Auto-create batch if not exists
      let batchId = yieldData.batch_id;
      if (!batchId) {
        const batchRes = await client.query(
          `INSERT INTO batches (batch_number, farm_name, farm_location, region, product_type,
            quantity_kg, batch_unit, harvest_date, quality_grade, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            yieldData.batch_number,
            yieldData.farm_location,
            yieldData.farm_location,
            yieldData.region,
            yieldData.crop_name,
            yieldData.quantity_kg,
            yieldData.batch_unit,
            yieldData.harvest_date,
            gradeUpper,
            req.user.id
          ]
        );
        batchId = batchRes.rows[0].id;
        await client.query(`UPDATE farmer_yields SET batch_id=$1 WHERE id=$2`, [batchId, id]);
      } else {
        await client.query(`UPDATE batches SET quality_grade=$1, updated_at=NOW() WHERE id=$2`, [gradeUpper, batchId]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Inspection submitted successfully. Batch created in system.',
        inspection_id: inspectionId,
        batch_id: batchId,
        certificate_number: certNumber
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Inspector inspect yield error:', error);
      res.status(500).json({ error: 'Failed to submit inspection' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
