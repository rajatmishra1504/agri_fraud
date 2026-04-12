const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Get all batches
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { product_type, farm_name, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT b.*, u.name as inspector_name,
             COALESCE(b.batch_unit, 'kg') as batch_unit,
             COALESCE((
               SELECT SUM(po.requested_quantity_kg)
               FROM purchase_orders po
               WHERE po.batch_id = b.id
                 AND po.status IN ('REQUESTED', 'APPROVED', 'FULFILLED')
             ), 0) as allocated_quantity_kg,
             GREATEST(
               b.quantity_kg - COALESCE((
                 SELECT SUM(po.requested_quantity_kg)
                 FROM purchase_orders po
                 WHERE po.batch_id = b.id
                   AND po.status IN ('REQUESTED', 'APPROVED', 'FULFILLED')
               ), 0),
               0
             ) as available_quantity_kg,
             COUNT(DISTINCT c.id) as certificate_count,
             COUNT(DISTINCT s.id) as shipment_count
      FROM batches b
      LEFT JOIN users u ON b.created_by = u.id
      LEFT JOIN certificates c ON b.id = c.batch_id
      LEFT JOIN shipments s ON b.id = s.batch_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (product_type) {
      conditions.push(`b.product_type = $${params.length + 1}`);
      params.push(product_type);
    }
    
    if (farm_name) {
      conditions.push(`b.farm_name ILIKE $${params.length + 1}`);
      params.push(`%${farm_name}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` GROUP BY b.id, u.name ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      batches: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// Get batch by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const batchResult = await pool.query(`
      SELECT b.*, u.name as inspector_name, u.email as inspector_email
      FROM batches b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = $1
    `, [id]);
    
    if (batchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    const batch = batchResult.rows[0];
    
    // Get certificates
    const certsResult = await pool.query(`
      SELECT c.*, u.name as issued_by_name
      FROM certificates c
      LEFT JOIN users u ON c.issued_by = u.id
      WHERE c.batch_id = $1
    `, [id]);
    
    // Get shipments
    const shipmentsResult = await pool.query(`
      SELECT s.*, u.name as transporter_name
      FROM shipments s
      LEFT JOIN users u ON s.transporter_id = u.id
      WHERE s.batch_id = $1
      ORDER BY s.created_at DESC
    `, [id]);
    
    // Get fraud flags
    const flagsResult = await pool.query(`
      SELECT * FROM fraud_flags
      WHERE batch_id = $1
      ORDER BY created_at DESC
    `, [id]);
    
    res.json({
      ...batch,
      certificates: certsResult.rows,
      shipments: shipmentsResult.rows,
      fraud_flags: flagsResult.rows
    });
  } catch (error) {
    console.error('Get batch error:', error);
    res.status(500).json({ error: 'Failed to fetch batch' });
  }
});

// Create batch
router.post('/',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  auditLog('CREATE_BATCH', 'batch'),
  async (req, res) => {
    try {
      const {
        farm_name,
        farm_location,
        product_type,
        quantity_kg,
        batch_unit,
        harvest_date,
        quality_grade
      } = req.body;

      const normalizedUnit = String(batch_unit || 'kg').trim().toLowerCase();

      if (!normalizedUnit) {
        return res.status(400).json({ error: 'batch_unit is required' });
      }
      
      // Generate batch number
      const batchNumber = `BATCH-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      
      const result = await pool.query(`
        INSERT INTO batches (
          batch_number, farm_name, farm_location, product_type,
          quantity_kg, batch_unit, harvest_date, quality_grade, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        batchNumber,
        farm_name,
        farm_location,
        product_type,
        quantity_kg,
        normalizedUnit,
        harvest_date,
        quality_grade,
        req.user.id
      ]);
      
      res.status(201).json({
        message: 'Batch created successfully',
        batch: result.rows[0]
      });
    } catch (error) {
      console.error('Create batch error:', error);
      res.status(500).json({ error: 'Failed to create batch' });
    }
  }
);

module.exports = router;
