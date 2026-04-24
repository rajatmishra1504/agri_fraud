const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Farmer submits a crop yield batch
router.post('/yield',
  authenticateToken,
  authorizeRoles('farmer'),
  auditLog('FARMER_SUBMIT_YIELD', 'farmer_yield'),
  async (req, res) => {
    try {
      const {
        crop_name,
        farm_location,
        region,
        quantity_kg,
        batch_unit,
        harvest_date,
        additional_notes
      } = req.body;

      if (!crop_name || !farm_location || !quantity_kg || !harvest_date) {
        return res.status(400).json({ error: 'crop_name, farm_location, quantity_kg and harvest_date are required' });
      }

      const normalizedUnit = String(batch_unit || 'kg').trim().toLowerCase();
      const normalizedRegion = String(region || farm_location || '').trim();
      const batchNumber = `FARM-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`;

      const result = await pool.query(`
        INSERT INTO farmer_yields (
          batch_number, farmer_id, crop_name, farm_location, region,
          quantity_kg, batch_unit, harvest_date, additional_notes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
        RETURNING *
      `, [
        batchNumber,
        req.user.id,
        crop_name,
        farm_location,
        normalizedRegion,
        quantity_kg,
        normalizedUnit,
        harvest_date,
        additional_notes || null
      ]);

      res.status(201).json({
        message: 'Yield submitted successfully. Awaiting inspector verification.',
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
          u.name AS inspector_name,
          u.email AS inspector_email,
          fi.quality_grade,
          fi.price_per_unit,
          fi.total_price,
          fi.inspection_notes,
          fi.certificate_number,
          fi.inspected_at,
          fi.status AS inspection_status
        FROM farmer_yields fy
        LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
        LEFT JOIN users u ON fi.inspector_id = u.id
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

      // Verify yield belongs to this farmer
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

      // Create fraud flag
      const flagResult = await pool.query(`
        INSERT INTO fraud_flags (
          flag_type, severity, evidence_json, status, description
        )
        VALUES ('FARMER_REPORTED_ISSUE', 'MEDIUM', $1, 'OPEN', $2)
        RETURNING *
      `, [
        JSON.stringify({
          yield_id: id,
          batch_number: yieldData.batch_number,
          farmer_id: req.user.id,
          crop_name: yieldData.crop_name,
          reported_issue: issue_description.trim()
        }),
        `Farmer reported issue on yield ${yieldData.batch_number}: ${issue_description.trim()}`
      ]);

      // Update yield with issue raised flag
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

// Inspector: Get all pending yields for inspection
router.get('/pending-yields',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          fy.*,
          u.name AS farmer_name,
          u.email AS farmer_email,
          u.phone AS farmer_phone,
          fi.quality_grade,
          fi.price_per_unit,
          fi.total_price,
          fi.inspection_notes,
          fi.certificate_number,
          fi.inspected_at,
          fi.status AS inspection_status,
          fi.id AS inspection_id
        FROM farmer_yields fy
        JOIN users u ON u.id = fy.farmer_id
        LEFT JOIN farm_inspections fi ON fi.yield_id = fy.id
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
// This also auto-creates a batch in the batches table so the yield enters the supply chain
router.post('/yield/:id/inspect',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  auditLog('INSPECTOR_INSPECT_YIELD', 'farm_inspection'),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        quality_grade,
        price_per_unit,
        inspection_notes
      } = req.body;

      if (!quality_grade || !price_per_unit) {
        return res.status(400).json({ error: 'quality_grade and price_per_unit are required' });
      }

      const validGrades = ['A', 'B', 'C', 'D', 'F'];
      if (!validGrades.includes(String(quality_grade).toUpperCase())) {
        return res.status(400).json({ error: 'quality_grade must be one of: A, B, C, D, F' });
      }

      // Verify yield exists
      const yieldResult = await client.query(
        `SELECT * FROM farmer_yields WHERE id = $1`,
        [id]
      );

      if (yieldResult.rows.length === 0) {
        return res.status(404).json({ error: 'Yield not found' });
      }

      const yieldData = yieldResult.rows[0];
      const totalPrice = Number(price_per_unit) * Number(yieldData.quantity_kg);
      const certNumber = `CERT-${yieldData.batch_number}-${Date.now().toString().slice(-4)}`;
      const gradeUpper = String(quality_grade).toUpperCase();

      await client.query('BEGIN');

      // Upsert inspection
      const existingInspection = await client.query(
        `SELECT id FROM farm_inspections WHERE yield_id = $1`,
        [id]
      );

      let inspectionResult;
      if (existingInspection.rows.length > 0) {
        inspectionResult = await client.query(`
          UPDATE farm_inspections
          SET quality_grade = $1, price_per_unit = $2, total_price = $3,
              inspection_notes = $4, certificate_number = $5,
              inspector_id = $6, inspected_at = NOW(), status = 'COMPLETED'
          WHERE yield_id = $7
          RETURNING *
        `, [
          gradeUpper, price_per_unit, totalPrice,
          inspection_notes || null, certNumber,
          req.user.id, id
        ]);
      } else {
        inspectionResult = await client.query(`
          INSERT INTO farm_inspections (
            yield_id, inspector_id, quality_grade, price_per_unit,
            total_price, inspection_notes, certificate_number, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED')
          RETURNING *
        `, [
          id, req.user.id, gradeUpper, price_per_unit,
          totalPrice, inspection_notes || null, certNumber
        ]);
      }

      // Auto-create or update a batch in the batches table from this farmer yield
      // batch_number mirrors the farmer yield batch_number for full traceability
      const existingBatch = await client.query(
        `SELECT id FROM batches WHERE batch_number = $1`,
        [yieldData.batch_number]
      );

      let batchId;
      if (existingBatch.rows.length > 0) {
        // Re-inspection: update the existing batch with new grade
        const updatedBatch = await client.query(`
          UPDATE batches
          SET quality_grade = $1, updated_at = NOW()
          WHERE batch_number = $2
          RETURNING id
        `, [gradeUpper, yieldData.batch_number]);
        batchId = updatedBatch.rows[0].id;
      } else {
        // First inspection: create the batch from farmer yield data
        const newBatch = await client.query(`
          INSERT INTO batches (
            batch_number, farm_name, farm_location, region,
            product_type, quantity_kg, batch_unit,
            harvest_date, quality_grade, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          yieldData.batch_number,
          yieldData.crop_name,
          yieldData.farm_location,
          yieldData.region,
          yieldData.crop_name,
          yieldData.quantity_kg,
          yieldData.batch_unit,
          yieldData.harvest_date,
          gradeUpper,
          req.user.id
        ]);
        batchId = newBatch.rows[0].id;
      }

      // Link the batch_id back to the farmer yield for full traceability
      await client.query(
        `UPDATE farmer_yields SET status = 'INSPECTED', batch_id = $1, updated_at = NOW() WHERE id = $2`,
        [batchId, id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Inspection completed and batch created successfully',
        inspection: inspectionResult.rows[0],
        batch_id: batchId
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
