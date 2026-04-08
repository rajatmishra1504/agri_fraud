const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

const ALLOWED_STATUSES = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

router.get('/queue',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT po.id as order_id, po.order_number, po.batch_id,
                po.requested_quantity_kg, po.delivery_location, po.preferred_delivery_date,
                po.delivery_contact_name, po.delivery_contact_phone, po.delivery_instructions,
                b.batch_number, b.product_type, b.farm_name, b.farm_location as pickup_location,
                buyer.name as buyer_name
         FROM purchase_orders po
         JOIN batches b ON po.batch_id = b.id
         LEFT JOIN users buyer ON po.buyer_id = buyer.id
         LEFT JOIN shipments s ON s.order_id = po.id
         WHERE po.status = 'APPROVED' AND s.id IS NULL
         ORDER BY po.reviewed_at DESC NULLS LAST, po.created_at DESC`
      );

      res.json({
        requests: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      console.error('Get shipment queue error:', error);
      res.status(500).json({ error: 'Failed to fetch approved shipment requests' });
    }
  }
);

router.post('/',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  auditLog('CREATE_SHIPMENT', 'shipment'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        order_id,
        batch_id,
        from_location,
        to_location,
        distance_km,
        weight_kg,
        vehicle_number,
        from_lat,
        from_lng,
        to_lat,
        to_lng,
        current_location,
        expected_delivery_date,
        delivery_notes,
        delivered_to_name,
        status
      } = req.body;

      const shipmentStatus = status && ALLOWED_STATUSES.includes(status) ? status : 'PENDING';
      const shipmentNumber = `SHIP-${Date.now().toString().slice(-8)}`;

      await client.query('BEGIN');

      let finalBatchId = batch_id;
      let finalFromLocation = from_location;
      let finalToLocation = to_location;
      let finalWeight = weight_kg;
      let finalExpectedDeliveryDate = expected_delivery_date || null;
      let finalCurrentLocation = current_location || null;

      if (order_id) {
        const orderResult = await client.query(
          `SELECT po.*, b.batch_number, b.farm_location, b.quantity_kg
           FROM purchase_orders po
           JOIN batches b ON po.batch_id = b.id
           WHERE po.id = $1
           FOR UPDATE`,
          [order_id]
        );

        if (orderResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Approved order not found' });
        }

        const order = orderResult.rows[0];
        if (order.status !== 'APPROVED') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Only APPROVED orders can be turned into shipments' });
        }

        const existingShipment = await client.query(
          'SELECT id FROM shipments WHERE order_id = $1 LIMIT 1',
          [order_id]
        );

        if (existingShipment.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Shipment already exists for this order' });
        }

        finalBatchId = order.batch_id;
        finalFromLocation = order.farm_location;
        finalToLocation = order.delivery_location;
        finalWeight = finalWeight || order.requested_quantity_kg || order.quantity_kg;
        finalExpectedDeliveryDate = finalExpectedDeliveryDate || order.preferred_delivery_date;
        finalCurrentLocation = finalCurrentLocation || order.farm_location;
      }

      if (!finalBatchId || !finalFromLocation || !finalToLocation || !finalWeight) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'batch_id, from_location, to_location and weight_kg are required'
        });
      }

      const insertResult = await client.query(
        `INSERT INTO shipments (
          order_id, batch_id, shipment_number, from_location, to_location,
          distance_km, weight_kg, transporter_id, vehicle_number,
          from_lat, from_lng, to_lat, to_lng,
          current_location, expected_delivery_date, delivery_notes, delivered_to_name,
          shipped_at, status
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          CASE WHEN $18::text IN ('IN_TRANSIT', 'DELIVERED') THEN NOW() ELSE NULL END,
          $18::shipment_status
        )
        RETURNING *`,
        [
          order_id || null,
          finalBatchId,
          shipmentNumber,
          finalFromLocation,
          finalToLocation,
          distance_km || null,
          finalWeight,
          req.user.id,
          vehicle_number || null,
          from_lat || null,
          from_lng || null,
          to_lat || null,
          to_lng || null,
          finalCurrentLocation,
          finalExpectedDeliveryDate,
          delivery_notes || null,
          delivered_to_name || null,
          shipmentStatus
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Shipment created successfully',
        shipment: insertResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create shipment error:', error);
      res.status(500).json({ error: 'Failed to create shipment' });
    } finally {
      client.release();
    }
  }
);

router.put('/:id',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  auditLog('UPDATE_SHIPMENT', 'shipment'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const {
        status,
        delivered_at,
        weight_kg,
        current_location,
        expected_delivery_date,
        delivery_notes,
        delivered_to_name
      } = req.body;

      if (!status || !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }

      await client.query('BEGIN');

      const shipmentResult = await client.query(
        'SELECT * FROM shipments WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (shipmentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Shipment not found' });
      }

      const shipment = shipmentResult.rows[0];
      if (req.user.role === 'transporter' && shipment.transporter_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only update your own shipments' });
      }

      const updateResult = await client.query(
        `UPDATE shipments
         SET status = $1::shipment_status,
             delivered_at = CASE
               WHEN $1::text = 'DELIVERED' THEN COALESCE($2::timestamp, NOW())
               ELSE delivered_at
             END,
             shipped_at = CASE
               WHEN $1::text IN ('IN_TRANSIT', 'DELIVERED') THEN COALESCE(shipped_at, NOW())
               ELSE shipped_at
             END,
             weight_kg = COALESCE($3::decimal, weight_kg),
             current_location = COALESCE($4, current_location),
             expected_delivery_date = COALESCE($5::date, expected_delivery_date),
             delivery_notes = COALESCE($6, delivery_notes),
             delivered_to_name = COALESCE($7, delivered_to_name)
         WHERE id = $8
         RETURNING *`,
        [
          status,
          delivered_at || null,
          weight_kg || null,
          current_location || null,
          expected_delivery_date || null,
          delivery_notes || null,
          delivered_to_name || null,
          id
        ]
      );

      if (status === 'DELIVERED' && shipment.order_id) {
        await client.query(
          `UPDATE purchase_orders
           SET status = 'FULFILLED',
               fulfilled_at = COALESCE(fulfilled_at, NOW())
           WHERE id = $1 AND status = 'APPROVED'`,
          [shipment.order_id]
        );
      }

      await client.query('COMMIT');

      res.json({
        message: 'Shipment updated successfully',
        shipment: updateResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update shipment error:', error);
      res.status(500).json({ error: 'Failed to update shipment' });
    } finally {
      client.release();
    }
  }
);

router.get('/',
  authenticateToken,
  async (req, res) => {
    try {
      const params = [];
      const whereParts = [];

      if (req.user.role === 'transporter') {
        whereParts.push(`s.transporter_id = $${params.length + 1}`);
        params.push(req.user.id);
      }

      if (req.user.role === 'buyer') {
        whereParts.push(`po.buyer_id = $${params.length + 1}`);
        params.push(req.user.id);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT s.*, b.batch_number, b.product_type, b.farm_location as pickup_location,
                u.name as transporter_name,
                po.order_number, po.delivery_location, po.preferred_delivery_date,
                po.delivery_contact_name, po.delivery_contact_phone
         FROM shipments s
         LEFT JOIN batches b ON s.batch_id = b.id
         LEFT JOIN users u ON s.transporter_id = u.id
         LEFT JOIN purchase_orders po ON s.order_id = po.id
         ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT 200`,
        params
      );

      res.json({ shipments: result.rows });
    } catch (error) {
      console.error('Get shipments error:', error);
      res.status(500).json({ error: 'Failed to fetch shipments' });
    }
  }
);

router.post('/:id/status',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
      }

      const result = await pool.query(
        `UPDATE shipments
         SET status = $1::shipment_status,
           delivered_at = CASE WHEN $1::text = 'DELIVERED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: 'Update failed' });
    }
  }
);

module.exports = router;
