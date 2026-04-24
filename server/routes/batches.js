const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

const ACTIVE_SHIPMENT_STATUSES = ['PENDING', 'IN_TRANSIT'];
const ACTIVE_ORDER_STATUSES = ['REQUESTED', 'APPROVED'];

// Get all batches
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      product_type,
      farm_name,
      limit = 50,
      offset = 0,
      include_deleted = 'false',
      only_deleted = 'false'
    } = req.query;
    const includeDeleted = String(include_deleted).toLowerCase() === 'true' && req.user.role === 'admin';
    const onlyDeleted = String(only_deleted).toLowerCase() === 'true' && includeDeleted;
    
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

    if (!includeDeleted) {
      conditions.push(`COALESCE(b.is_deleted, false) = false`);
    } else if (onlyDeleted) {
      conditions.push(`COALESCE(b.is_deleted, false) = true`);
    }

    if (req.user.role === 'inspector') {
      conditions.push(`b.created_by = $${params.length + 1}`);
      params.push(req.user.id);
    }

    if (req.user.role === 'buyer') {
      // Only show batches with available quantity and a valid certificate
      conditions.push(`GREATEST(
        b.quantity_kg - COALESCE((
          SELECT SUM(po.requested_quantity_kg)
          FROM purchase_orders po
          WHERE po.batch_id = b.id
            AND po.status IN ('REQUESTED', 'APPROVED', 'FULFILLED')
        ), 0),
        0
      ) > 0`);
      conditions.push(`EXISTS (SELECT 1 FROM certificates c WHERE c.batch_id = b.id AND c.is_valid = true)`);
    }
    
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
    const includeDeleted = String(req.query.include_deleted || '').toLowerCase() === 'true' && req.user.role === 'admin';

    const batchParams = [id];
    const deletedFilter = includeDeleted ? '' : 'AND COALESCE(b.is_deleted, false) = false';
    const ownershipFilter = req.user.role === 'inspector'
      ? `AND b.created_by = $${batchParams.length + 1}`
      : '';

    if (req.user.role === 'inspector') {
      batchParams.push(req.user.id);
    }
    
    const batchResult = await pool.query(`
      SELECT b.*, u.name as inspector_name, u.email as inspector_email
      FROM batches b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = $1 ${deletedFilter} ${ownershipFilter}
    `, batchParams);
    
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
        region,
        product_type,
        quantity_kg,
        batch_unit,
        harvest_date,
        quality_grade
      } = req.body;

      const normalizedUnit = String(batch_unit || 'kg').trim().toLowerCase();
      const normalizedRegion = String(region || farm_location || '').trim();

      if (!normalizedUnit) {
        return res.status(400).json({ error: 'batch_unit is required' });
      }
      
      // Generate batch number
      const batchNumber = `BATCH-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      
      const result = await pool.query(`
        INSERT INTO batches (
          batch_number, farm_name, farm_location, region, product_type,
          quantity_kg, batch_unit, harvest_date, quality_grade, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        batchNumber,
        farm_name,
        farm_location,
        normalizedRegion,
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

router.delete('/:id',
  authenticateToken,
  authorizeRoles('inspector', 'admin'),
  auditLog('DELETE_BATCH', 'batch'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const normalizedReason = String(req.body?.reason || '').trim();

      if (normalizedReason.length < 5) {
        return res.status(400).json({ error: 'Deletion reason must be at least 5 characters long' });
      }

      await client.query('BEGIN');

      const batchResult = await client.query(
        `SELECT id, batch_number, created_by
         FROM batches
         WHERE id = $1
           AND COALESCE(is_deleted, false) = false
         FOR UPDATE`,
        [id]
      );

      if (batchResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Batch not found' });
      }

      const batch = batchResult.rows[0];

      if (req.user.role === 'inspector' && Number(batch.created_by) !== Number(req.user.id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Inspectors can only delete batches created by themselves' });
      }

      const pendingShipmentsResult = await client.query(
        `SELECT id, shipment_number, status
         FROM shipments
         WHERE batch_id = $1
           AND status = ANY($2::shipment_status[])
         ORDER BY created_at DESC`,
        [id, ACTIVE_SHIPMENT_STATUSES]
      );

      const activeOrdersResult = await client.query(
        `SELECT id, order_number, status
         FROM purchase_orders
         WHERE batch_id = $1
           AND status = ANY($2::order_status[])
         ORDER BY created_at DESC`,
        [id, ACTIVE_ORDER_STATUSES]
      );

      const openFlagsResult = await client.query(
        `SELECT id, flag_type, status
         FROM fraud_flags
         WHERE batch_id = $1
           AND status IN ('OPEN', 'INVESTIGATING')
         ORDER BY created_at DESC`,
        [id]
      );

      const openCasesResult = await client.query(
        `SELECT fc.id, fc.case_number, fc.decision
         FROM fraud_cases fc
         JOIN fraud_flags ff ON ff.id = fc.flag_id
         WHERE ff.batch_id = $1
           AND fc.decision = 'PENDING'
         ORDER BY fc.created_at DESC`,
        [id]
      );

      const blockers = {
        pending_shipments: pendingShipmentsResult.rows,
        active_orders: activeOrdersResult.rows,
        open_flags: openFlagsResult.rows,
        open_cases: openCasesResult.rows
      };

      const hasBlockers = Object.values(blockers).some((items) => items.length > 0);

      if (hasBlockers) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Batch cannot be deleted because active operations are linked to it',
          blockers
        });
      }

      const deletedResult = await client.query(
        `UPDATE batches
         SET is_deleted = true,
             deleted_at = NOW(),
             deleted_by = $2,
             delete_reason = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, batch_number, is_deleted, deleted_at, delete_reason`,
        [id, req.user.id, normalizedReason]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Batch deleted successfully',
        id: deletedResult.rows[0].id,
        batch: deletedResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete batch error:', error);
      res.status(500).json({ error: 'Failed to delete batch' });
    } finally {
      client.release();
    }
  }
);

router.patch('/:id/restore',
  authenticateToken,
  authorizeRoles('admin'),
  auditLog('RESTORE_BATCH', 'batch'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      await client.query('BEGIN');

      const batchResult = await client.query(
        `SELECT id, batch_number, is_deleted
         FROM batches
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (batchResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Batch not found' });
      }

      if (!batchResult.rows[0].is_deleted) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Batch is not archived' });
      }

      const restoreResult = await client.query(
        `UPDATE batches
         SET is_deleted = false,
             deleted_at = NULL,
             deleted_by = NULL,
             delete_reason = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Batch restored successfully',
        id: restoreResult.rows[0].id,
        batch: restoreResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Restore batch error:', error);
      res.status(500).json({ error: 'Failed to restore batch' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
