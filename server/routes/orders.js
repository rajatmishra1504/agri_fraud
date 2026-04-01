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

function isMissingPurchaseOrdersTable(error) {
  return error?.code === '42P01' && /purchase_orders/i.test(error?.message || '');
}

function buildOrderQuery(whereClause = '', includeWhere = false) {
  return `SELECT po.*, b.batch_number, b.product_type, b.farm_name, b.quality_grade,
                 buyer.name as buyer_name,
                 reviewer.name as reviewed_by_name
          FROM purchase_orders po
          JOIN batches b ON po.batch_id = b.id
          LEFT JOIN users buyer ON po.buyer_id = buyer.id
          LEFT JOIN users reviewer ON po.reviewed_by = reviewer.id
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
      const { batch_id, requested_quantity_kg, notes } = req.body;

      if (!batch_id) {
        return res.status(400).json({ error: 'batch_id is required' });
      }

      await client.query('BEGIN');

      const batchResult = await client.query(
        `SELECT id, batch_number, product_type, quantity_kg
         FROM batches
         WHERE id = $1`,
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

      const activeOrderResult = await client.query(
        `SELECT id, status
         FROM purchase_orders
         WHERE buyer_id = $1
           AND batch_id = $2
           AND status IN ('REQUESTED', 'APPROVED')
         LIMIT 1`,
        [req.user.id, batch_id]
      );

      if (activeOrderResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'You already have an active order for this batch',
          order: activeOrderResult.rows[0]
        });
      }

      const requestedQty = Number(requested_quantity_kg || batchResult.rows[0].quantity_kg);

      if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'requested_quantity_kg must be a positive number' });
      }

      if (requestedQty > Number(batchResult.rows[0].quantity_kg)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'requested_quantity_kg cannot exceed batch quantity' });
      }

      const orderResult = await client.query(
        `INSERT INTO purchase_orders (
           order_number,
           buyer_id,
           batch_id,
           requested_quantity_kg,
           notes,
           status
         )
         VALUES ($1, $2, $3, $4, $5, 'REQUESTED')
         RETURNING *`,
        [
          `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
          req.user.id,
          batch_id,
          requestedQty,
          notes || null
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
