const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

const ORDER_STATUSES = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED'
};

const ORDER_DUPLICATE_WINDOW_SECONDS = parseInt(process.env.ORDER_DUPLICATE_WINDOW_SECONDS, 10) || 15;
const QUANTITY_DECIMALS = 2;
const QUANTITY_ROUND_FACTOR = 10 ** QUANTITY_DECIMALS;

function isMissingPurchaseOrdersTable(error) {
  return error?.code === '42P01' && /purchase_orders/i.test(error?.message || '');
}

function normalizeUnit(unitValue) {
  return String(unitValue || '').trim().toLowerCase();
}

function normalizeQuantity(quantityValue) {
  const numericQuantity = Number(quantityValue);
  if (!Number.isFinite(numericQuantity)) return NaN;
  return Math.round((numericQuantity + Number.EPSILON) * QUANTITY_ROUND_FACTOR) / QUANTITY_ROUND_FACTOR;
}

function buildOrderQuery(whereClause = '', includeWhere = false) {
  return `SELECT po.*, b.batch_number, b.product_type, b.farm_name, b.farm_location as pickup_location, b.quality_grade,
                 buyer.name as buyer_name,
                 reviewer.name as reviewed_by_name,
       pt.name as preferred_transporter_name,
       pt.region as preferred_transporter_region,
                 s.id as shipment_id,
                 s.shipment_number,
                 s.status as shipment_status,
                 s.transporter_id,
                 s.delivered_at
          FROM purchase_orders po
          JOIN batches b ON po.batch_id = b.id
          LEFT JOIN users buyer ON po.buyer_id = buyer.id
          LEFT JOIN users reviewer ON po.reviewed_by = reviewer.id
     LEFT JOIN users pt ON po.preferred_transporter_id = pt.id
          LEFT JOIN shipments s ON s.order_id = po.id
          ${includeWhere ? `WHERE ${whereClause}` : ''}
          ORDER BY po.created_at DESC`;
}

// Create a purchase request
router.post('/',
  authenticateToken,
  authorizeRoles('buyer', 'admin'),
  auditLog('CREATE_ORDER', 'order'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        batch_id,
        requested_quantity_kg,
        requested_unit,
        notes,
        delivery_location,
        preferred_delivery_date,
        delivery_contact_name,
        delivery_contact_phone,
        delivery_instructions,
        preferred_transporter_id
      } = req.body;

      if (!batch_id) {
        return res.status(400).json({ error: 'batch_id is required' });
      }

      if (!delivery_location || !String(delivery_location).trim()) {
        return res.status(400).json({ error: 'delivery_location is required' });
      }

      if (!preferred_delivery_date) {
        return res.status(400).json({ error: 'preferred_delivery_date is required' });
      }

      const preferredDate = new Date(preferred_delivery_date);
      if (Number.isNaN(preferredDate.getTime())) {
        return res.status(400).json({ error: 'preferred_delivery_date must be a valid date' });
      }

      await client.query('BEGIN');

      const batchResult = await client.query(
        `SELECT id, batch_number, product_type, quantity_kg, COALESCE(batch_unit, 'kg') as batch_unit
         FROM batches
         WHERE id = $1
           AND COALESCE(is_deleted, false) = false
         FOR UPDATE`,
        [batch_id]
      );

      if (batchResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Batch not found' });
      }

      // Batch must have at least one currently valid certificate.
      const certResult = await client.query(
        `SELECT id
         FROM certificates
         WHERE batch_id = $1 AND is_valid = true
         LIMIT 1`,
        [batch_id]
      );

      if (certResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Batch does not have a valid certificate' });
      }

      const requestedQty = normalizeQuantity(requested_quantity_kg || batchResult.rows[0].quantity_kg);
      const batchUnit = normalizeUnit(batchResult.rows[0].batch_unit);
      const normalizedRequestedUnit = normalizeUnit(requested_unit || batchUnit);

      if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'requested_quantity_kg must be a positive number' });
      }

      if (!normalizedRequestedUnit) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'requested_unit is required' });
      }

      if (normalizedRequestedUnit !== batchUnit) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `requested_unit must match the batch unit (${batchUnit})` });
      }

      if (requestedQty > Number(batchResult.rows[0].quantity_kg)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'requested_quantity_kg cannot exceed batch quantity' });
      }

      const allocationResult = await client.query(
        `SELECT COALESCE(SUM(requested_quantity_kg), 0) as allocated_quantity_kg
         FROM purchase_orders
         WHERE batch_id = $1
           AND status IN ('REQUESTED', 'APPROVED', 'FULFILLED')`,
        [batch_id]
      );

      const batchQuantity = normalizeQuantity(batchResult.rows[0].quantity_kg);
      const allocatedQuantity = normalizeQuantity(allocationResult.rows[0].allocated_quantity_kg || 0);
      const availableQuantity = normalizeQuantity(Math.max(batchQuantity - allocatedQuantity, 0));

      if (requestedQty - availableQuantity > 1 / QUANTITY_ROUND_FACTOR) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Only ${availableQuantity.toFixed(2)} kg is currently available for this batch`
        });
      }

      const normalizedDeliveryLocation = String(delivery_location).trim();
      const normalizedDeliveryContactName = delivery_contact_name ? String(delivery_contact_name).trim() : null;
      const normalizedDeliveryContactPhone = delivery_contact_phone ? String(delivery_contact_phone).trim() : null;
      const normalizedDeliveryInstructions = delivery_instructions ? String(delivery_instructions).trim() : null;
      const normalizedNotes = notes ? String(notes).trim() : null;
      const preferredDateIso = preferredDate.toISOString().slice(0, 10);
      let transporterIdValue = null;

      if (preferred_transporter_id !== undefined && preferred_transporter_id !== null && String(preferred_transporter_id).trim() !== '') {
        const transporterResult = await client.query(
          `SELECT id, name, region FROM users WHERE id = $1 AND role = 'transporter' AND is_active = true`,
          [preferred_transporter_id]
        );

        if (transporterResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Preferred transporter not found' });
        }

        transporterIdValue = transporterResult.rows[0].id;
      }

      // Guard against accidental double-submit clicks: same payload within a short window.
      const duplicateOrderResult = await client.query(
        `SELECT id, order_number, created_at
         FROM purchase_orders
         WHERE buyer_id = $1
           AND batch_id = $2
           AND requested_quantity_kg = $3
           AND COALESCE(requested_unit, '') = $4
           AND delivery_location = $5
           AND preferred_delivery_date = $6
           AND COALESCE(delivery_contact_name, '') = COALESCE($7, '')
           AND COALESCE(delivery_contact_phone, '') = COALESCE($8, '')
           AND COALESCE(delivery_instructions, '') = COALESCE($9, '')
           AND COALESCE(notes, '') = COALESCE($10, '')
           AND created_at >= NOW() - ($11::text || ' seconds')::interval
         ORDER BY created_at DESC
         LIMIT 1`,
        [
          req.user.id,
          batch_id,
          requestedQty,
          normalizedRequestedUnit,
          normalizedDeliveryLocation,
          preferredDateIso,
          normalizedDeliveryContactName,
          normalizedDeliveryContactPhone,
          normalizedDeliveryInstructions,
          normalizedNotes,
          ORDER_DUPLICATE_WINDOW_SECONDS
        ]
      );

      if (duplicateOrderResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Duplicate request detected. Please wait a few seconds before retrying.',
          existing_order: duplicateOrderResult.rows[0]
        });
      }

      const orderResult = await client.query(
        `INSERT INTO purchase_orders (
           order_number,
           buyer_id,
           batch_id,
           requested_quantity_kg,
           requested_unit,
           delivery_location,
           preferred_delivery_date,
           delivery_contact_name,
           delivery_contact_phone,
           delivery_instructions,
           preferred_transporter_id,
           notes,
           status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'REQUESTED')
         RETURNING *`,
        [
          `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
          req.user.id,
          batch_id,
          requestedQty,
          normalizedRequestedUnit,
          normalizedDeliveryLocation,
          preferredDateIso,
          normalizedDeliveryContactName,
          normalizedDeliveryContactPhone,
          normalizedDeliveryInstructions,
          transporterIdValue,
          normalizedNotes
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Purchase request created successfully',
        order: orderResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create order error:', error);

      if (isMissingPurchaseOrdersTable(error)) {
        return res.status(503).json({
          error: 'Purchase order feature is unavailable because database schema is outdated. Please run migration.'
        });
      }

      res.status(500).json({ error: 'Failed to create purchase request' });
    } finally {
      client.release();
    }
  }
);

// Get current buyer's orders
router.get('/my',
  authenticateToken,
  authorizeRoles('buyer', 'admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        buildOrderQuery('po.buyer_id = $1', true),
        [req.user.id]
      );

      res.json({
        orders: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Get buyer orders error:', error);

      if (isMissingPurchaseOrdersTable(error)) {
        return res.json({
          orders: [],
          count: 0
        });
      }

      res.status(500).json({ error: 'Failed to fetch purchase requests' });
    }
  }
);

// Admin/analyst can view all orders
router.get('/',
  authenticateToken,
  authorizeRoles('admin', 'fraud_analyst'),
  async (req, res) => {
    try {
      const result = await pool.query(buildOrderQuery());

      res.json({
        orders: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Get all orders error:', error);

      if (isMissingPurchaseOrdersTable(error)) {
        return res.json({
          orders: [],
          count: 0
        });
      }

      res.status(500).json({ error: 'Failed to fetch purchase requests' });
    }
  }
);

router.patch('/:id/review',
  authenticateToken,
  authorizeRoles('admin', 'fraud_analyst'),
  auditLog('REVIEW_ORDER', 'order'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const { status, rejection_reason } = req.body;

      if (![ORDER_STATUSES.APPROVED, ORDER_STATUSES.REJECTED].includes(status)) {
        return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
      }

      await client.query('BEGIN');

      const existingOrderResult = await client.query(
        'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (existingOrderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }

      const existingOrder = existingOrderResult.rows[0];
      if (existingOrder.status !== ORDER_STATUSES.REQUESTED) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Only REQUESTED orders can be reviewed',
          current_status: existingOrder.status
        });
      }

      if (status === ORDER_STATUSES.REJECTED && !rejection_reason) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'rejection_reason is required when rejecting an order' });
      }

      const updateResult = await client.query(
        `UPDATE purchase_orders
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             rejection_reason = $3
         WHERE id = $4
         RETURNING *`,
        [status, req.user.id, status === ORDER_STATUSES.REJECTED ? rejection_reason : null, id]
      );

      await client.query('COMMIT');

      res.json({
        message: `Order ${status.toLowerCase()} successfully`,
        order: updateResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Review order error:', error);

      if (isMissingPurchaseOrdersTable(error)) {
        return res.status(503).json({
          error: 'Purchase order feature is unavailable because database schema is outdated. Please run migration.'
        });
      }

      res.status(500).json({ error: 'Failed to review order' });
    } finally {
      client.release();
    }
  }
);

router.patch('/:id/fulfill',
  authenticateToken,
  authorizeRoles('admin'),
  auditLog('FULFILL_ORDER', 'order'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;

      await client.query('BEGIN');

      const existingOrderResult = await client.query(
        'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (existingOrderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }

      const existingOrder = existingOrderResult.rows[0];
      if (existingOrder.status !== ORDER_STATUSES.APPROVED) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Only APPROVED orders can be fulfilled',
          current_status: existingOrder.status
        });
      }

      const updateResult = await client.query(
        `UPDATE purchase_orders
         SET status = $1,
             fulfilled_at = NOW(),
             reviewed_by = COALESCE(reviewed_by, $2),
             reviewed_at = COALESCE(reviewed_at, NOW())
         WHERE id = $3
         RETURNING *`,
        [ORDER_STATUSES.FULFILLED, req.user.id, id]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Order fulfilled successfully',
        order: updateResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Fulfill order error:', error);

      if (isMissingPurchaseOrdersTable(error)) {
        return res.status(503).json({
          error: 'Purchase order feature is unavailable because database schema is outdated. Please run migration.'
        });
      }

      res.status(500).json({ error: 'Failed to fulfill order' });
    } finally {
      client.release();
    }
  }
);

router.patch('/:id/cancel',
  authenticateToken,
  authorizeRoles('buyer', 'admin'),
  auditLog('CANCEL_ORDER', 'order'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;

      await client.query('BEGIN');

      const existingOrderResult = await client.query(
        'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (existingOrderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }

      const existingOrder = existingOrderResult.rows[0];
      const isBuyer = req.user.role === 'buyer';
      const buyerCanCancelStatuses = [ORDER_STATUSES.REQUESTED];
      const adminCanCancelStatuses = [ORDER_STATUSES.REQUESTED, ORDER_STATUSES.APPROVED];
      const allowedStatuses = isBuyer ? buyerCanCancelStatuses : adminCanCancelStatuses;

      if (isBuyer && existingOrder.buyer_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only cancel your own orders' });
      }

      if (!allowedStatuses.includes(existingOrder.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Only ${allowedStatuses.join(' or ')} orders can be cancelled by your role`,
          current_status: existingOrder.status
        });
      }

      const updateResult = await client.query(
        `UPDATE purchase_orders
         SET status = $1,
             reviewed_by = CASE WHEN $2::text = 'admin' THEN $3 ELSE reviewed_by END,
             reviewed_at = CASE WHEN $2::text = 'admin' THEN NOW() ELSE reviewed_at END
         WHERE id = $4
         RETURNING *`,
        [ORDER_STATUSES.CANCELLED, req.user.role, req.user.id, id]
      );

      await client.query('COMMIT');

      res.json({
        message: 'Order cancelled successfully',
        order: updateResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Cancel order error:', error);

      if (isMissingPurchaseOrdersTable(error)) {
        return res.status(503).json({
          error: 'Purchase order feature is unavailable because database schema is outdated. Please run migration.'
        });
      }

      res.status(500).json({ error: 'Failed to cancel order' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
