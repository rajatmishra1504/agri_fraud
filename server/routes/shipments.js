const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

const ALLOWED_STATUSES = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
const WEIGHT_CHANGE_THRESHOLD = Number(process.env.WEIGHT_CHANGE_THRESHOLD || 15);

router.get('/queue',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  async (req, res) => {
    try {
      const params = [];
      const transporterFilter = req.user.role === 'transporter'
        ? (() => {
            params.push(req.user.id);
            return `AND (po.preferred_transporter_id IS NULL OR po.preferred_transporter_id = $${params.length})`;
          })()
        : '';

      const result = await pool.query(
        `SELECT po.id as order_id, po.order_number, po.batch_id,
                po.requested_quantity_kg, po.delivery_location, po.preferred_delivery_date,
                po.delivery_contact_name, po.delivery_contact_phone, po.delivery_instructions,
                b.batch_number, b.product_type, b.farm_name, b.farm_location as pickup_location,
                buyer.name as buyer_name,
                pt.name as preferred_transporter_name,
                pt.region as preferred_transporter_region,
                po.preferred_transporter_id
         FROM purchase_orders po
         JOIN batches b ON po.batch_id = b.id
         LEFT JOIN users buyer ON po.buyer_id = buyer.id
         LEFT JOIN users pt ON po.preferred_transporter_id = pt.id
         LEFT JOIN shipments s ON s.order_id = po.id
         WHERE po.status = 'APPROVED' AND s.id IS NULL
           ${transporterFilter}
         ORDER BY po.reviewed_at DESC NULLS LAST, po.created_at DESC`,
        params
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
      let finalTransporterId = req.user.id;

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

        if (order.preferred_transporter_id) {
          if (req.user.role === 'transporter' && Number(order.preferred_transporter_id) !== Number(req.user.id)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'This shipment is reserved for a different transporter' });
          }

          finalTransporterId = order.preferred_transporter_id;
        }
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
          finalTransporterId,
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
  authorizeRoles('transporter', 'admin', 'fraud_analyst'),
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
        delivered_to_name,
        fraud_reason
      } = req.body;

      if (!status || !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
      }

      const hasWeightUpdate = weight_kg !== undefined && weight_kg !== null && weight_kg !== '';
      const normalizedWeight = hasWeightUpdate ? Number(weight_kg) : null;

      if (hasWeightUpdate && (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0)) {
        return res.status(400).json({ error: 'weight_kg must be a positive number' });
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
      let claimedTransporterId = null;

      if (shipment.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Cancelled shipments are locked and cannot be modified.' });
      }

      if (req.user.role === 'transporter' && shipment.status === 'DELIVERED') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Delivered shipments are locked. Transporter cannot modify transit fields after delivery.' });
      }

      if (req.user.role === 'fraud_analyst') {
        if (status !== 'CANCELLED') {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Fraud analyst can only update shipment status to CANCELLED' });
        }

        const reason = (fraud_reason || delivery_notes || '').toString().trim();
        if (!reason) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Fraud reason is required to cancel shipment as fraudulent act' });
        }

        const analystNote = `FRAUDULENT ACT: ${reason}`;

        const cancelledResult = await client.query(
          `UPDATE shipments
           SET status = 'CANCELLED'::shipment_status,
               delivery_notes = CASE
                 WHEN delivery_notes IS NULL OR delivery_notes = '' THEN $1
                 ELSE delivery_notes || ' | ' || $1
               END,
               updated_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [analystNote, id]
        );

        await client.query(
          `INSERT INTO fraud_flags (
            flag_type, severity, batch_id, shipment_id, evidence_json, description
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'ANALYST_FRAUD_CANCELLATION',
            'HIGH',
            shipment.batch_id,
            shipment.id,
            JSON.stringify({
              analyst_user_id: req.user.id,
              reason,
              previous_status: shipment.status,
              new_status: 'CANCELLED'
            }),
            'Shipment cancelled by fraud analyst due to fraudulent act.'
          ]
        );

        await client.query('COMMIT');

        return res.json({
          message: 'Shipment cancelled due to fraudulent act',
          shipment: cancelledResult.rows[0]
        });
      }

      if (req.user.role === 'transporter') {
        const requesterId = Number(req.user.id);
        if (!['PENDING', 'IN_TRANSIT'].includes(shipment.status)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Transporter can only update shipments in PENDING or IN_TRANSIT state.' });
        }

        // Active transport ownership follows the latest transporter who updates transit details.
        claimedTransporterId = requesterId;
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
             delivered_to_name = COALESCE($7, delivered_to_name),
             transporter_id = COALESCE($8::integer, transporter_id),
             updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          status,
          delivered_at || null,
          normalizedWeight,
          current_location || null,
          expected_delivery_date || null,
          delivery_notes || null,
          delivered_to_name || null,
          claimedTransporterId,
          id
        ]
      );

      if (hasWeightUpdate) {
        const previousWeight = Number(shipment.weight_kg);
        if (Number.isFinite(previousWeight) && previousWeight > 0) {
          const deltaPct = (Math.abs(normalizedWeight - previousWeight) / previousWeight) * 100;

          if (deltaPct >= WEIGHT_CHANGE_THRESHOLD) {
            const severity = deltaPct >= 30 ? 'HIGH' : 'MEDIUM';
            await client.query(
              `INSERT INTO fraud_flags (
                 flag_type, severity, batch_id, shipment_id, evidence_json, description
               ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                'ABNORMAL_WEIGHT_CHANGE',
                severity,
                shipment.batch_id,
                shipment.id,
                JSON.stringify({
                  previous_weight_kg: previousWeight,
                  updated_weight_kg: normalizedWeight,
                  change_percent: Number(deltaPct.toFixed(2)),
                  threshold_percent: WEIGHT_CHANGE_THRESHOLD,
                  changed_by_user_id: req.user.id
                }),
                `Shipment weight changed by ${deltaPct.toFixed(2)}%, exceeding ${WEIGHT_CHANGE_THRESHOLD}% threshold.`
              ]
            );
          }
        }
      }

      if (status === 'DELIVERED') {
        if (shipment.order_id) {
          await client.query(
            `UPDATE purchase_orders
             SET status = 'FULFILLED',
                 fulfilled_at = COALESCE(fulfilled_at, NOW())
             WHERE id = $1 AND status = 'APPROVED'`,
            [shipment.order_id]
          );
        }

        // --- MACHINE LEARNING FRAUD DETECTION ---
        const mlEngine = require('../services/machineLearning');
        const finalShipmentData = updateResult.rows[0];
        
        // Pass to the Random Forest model
        const mlAnalysis = mlEngine.evaluateShipment(finalShipmentData);
        
        if (mlAnalysis.isAnomaly) {
            console.log('🚨 ML Engine detected an anomaly! Creating CRITICAL Fraud Flag...', mlAnalysis.features);
            
            await client.query(
              `INSERT INTO fraud_flags (
                flag_type, severity, batch_id, shipment_id, evidence_json, description
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                'ML_PATTERN_ANOMALY',
                'CRITICAL',
                finalShipmentData.batch_id,
                finalShipmentData.id,
                JSON.stringify(mlAnalysis.features),
                'Machine Learning model detected suspicious multi-variate correlations in this shipment (distance vs time vs weight loss).'
              ]
            );
        }
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
        whereParts.push(`(s.status IN ('PENDING', 'IN_TRANSIT') OR s.transporter_id = $${params.length + 1} OR po.preferred_transporter_id = $${params.length + 1})`);
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
                u.region as transporter_region,
                po.order_number, po.delivery_location, po.preferred_delivery_date,
            po.delivery_contact_name, po.delivery_contact_phone,
            po.preferred_transporter_id,
            pt.name as preferred_transporter_name,
            pt.region as preferred_transporter_region
         FROM shipments s
         LEFT JOIN batches b ON s.batch_id = b.id
         LEFT JOIN users u ON s.transporter_id = u.id
         LEFT JOIN purchase_orders po ON s.order_id = po.id
          LEFT JOIN users pt ON po.preferred_transporter_id = pt.id
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
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
      }

      await client.query('BEGIN');

      const shipmentResult = await client.query(
        'SELECT id, transporter_id, order_id, status FROM shipments WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (shipmentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Shipment not found' });
      }

      const shipment = shipmentResult.rows[0];
      if (shipment.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Cancelled shipments are locked and cannot be modified.' });
      }

      if (req.user.role === 'transporter') {
        const requesterId = Number(req.user.id);

        if (shipment.status === 'DELIVERED' && status !== 'DELIVERED') {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Delivered shipments are locked. Transporter cannot change status after delivery.' });
        }

        if (!['PENDING', 'IN_TRANSIT'].includes(shipment.status)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Transporter can only update shipments in PENDING or IN_TRANSIT state.' });
        }

        await client.query(
          `UPDATE shipments
           SET transporter_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [requesterId, id]
        );
      }

      const result = await client.query(
        `UPDATE shipments
         SET status = $1::shipment_status,
           delivered_at = CASE WHEN $1::text = 'DELIVERED' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      await client.query('COMMIT');

      res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.log(err);
      res.status(500).json({ error: 'Update failed' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
