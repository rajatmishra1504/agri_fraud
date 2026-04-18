const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.get('/marketplace', authenticateToken, async (req, res) => {
  try {
    const { region = '', source_state = '', destination_state = '' } = req.query;
    const params = [];
    const filters = [`u.role = 'transporter'`, `u.is_active = true`];

    if (String(region || '').trim()) {
      params.push(String(region).trim());
      const regionParam = `$${params.length}`;
      filters.push(`(
        COALESCE(LOWER(TRIM(u.region)), '') = LOWER(TRIM(${regionParam}))
        OR COALESCE(LOWER(TRIM(u.transporter_source_state)), '') = LOWER(TRIM(${regionParam}))
        OR EXISTS (
          SELECT 1
          FROM UNNEST(COALESCE(u.transporter_destination_states, ARRAY[]::TEXT[])) AS ds
          WHERE LOWER(TRIM(ds)) = LOWER(TRIM(${regionParam}))
        )
      )`);
    }

    if (String(source_state || '').trim()) {
      params.push(String(source_state).trim());
      const sourceParam = `$${params.length}`;
      filters.push(`(
        COALESCE(LOWER(TRIM(u.transporter_source_state)), '') = LOWER(TRIM(${sourceParam}))
        OR COALESCE(LOWER(TRIM(u.region)), '') = LOWER(TRIM(${sourceParam}))
      )`);
    }

    if (String(destination_state || '').trim()) {
      params.push(String(destination_state).trim());
      const destinationParam = `$${params.length}`;
      filters.push(`(
        EXISTS (
          SELECT 1
          FROM UNNEST(COALESCE(u.transporter_destination_states, ARRAY[]::TEXT[])) AS ds
          WHERE LOWER(TRIM(ds)) = LOWER(TRIM(${destinationParam}))
        )
        OR COALESCE(LOWER(TRIM(u.region)), '') = LOWER(TRIM(${destinationParam}))
      )`);
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.region,
         u.transporter_source_state,
         u.transporter_destination_states,
         u.organization,
         u.created_at,
         rs.base_rating::numeric(4,2) AS rating,
         rs.rating_count,
         ss.completed_shipments,
         ss.active_shipments,
         fs.active_fraud_flags,
         fs.fraud_penalty_points,
         GREATEST(
           0,
           rs.base_rating - LEAST(fs.fraud_penalty_points, 4.5)
         )::numeric(4,2) AS effective_rating
       FROM users u
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(AVG(r.rating), 5) AS base_rating,
           COALESCE(COUNT(*), 0)::int AS rating_count
         FROM transporter_ratings r
         WHERE r.transporter_id = u.id
       ) rs ON true
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(COUNT(*) FILTER (WHERE s.status = 'DELIVERED'), 0)::int AS completed_shipments,
           COALESCE(COUNT(*) FILTER (WHERE s.status IN ('PENDING', 'IN_TRANSIT')), 0)::int AS active_shipments
         FROM shipments s
         WHERE s.transporter_id = u.id
       ) ss ON true
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(COUNT(ff.id), 0)::int AS active_fraud_flags,
           COALESCE(SUM(
             CASE ff.severity
               WHEN 'CRITICAL' THEN 1.50
               WHEN 'HIGH' THEN 1.00
               WHEN 'MEDIUM' THEN 0.50
               ELSE 0.25
             END
           ), 0)::numeric(6,2) AS fraud_penalty_points
         FROM shipments s
         JOIN fraud_flags ff ON ff.shipment_id = s.id
         WHERE s.transporter_id = u.id
           AND ff.status IN ('OPEN', 'INVESTIGATING')
       ) fs ON true
       WHERE ${filters.join(' AND ')}
       ORDER BY effective_rating DESC, rs.base_rating DESC, rs.rating_count DESC, ss.completed_shipments DESC, u.name ASC`,
      params
    );

    res.json({ transporters: result.rows });
  } catch (error) {
    console.error('Get transporters marketplace error:', error);
    res.status(500).json({ error: 'Failed to load transporters' });
  }
});

router.post('/:id/rate',
  authenticateToken,
  authorizeRoles('buyer', 'admin', 'fraud_analyst'),
  auditLog('RATE_TRANSPORTER', 'transporter'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const transporterId = Number(req.params.id);
      const { shipment_id, order_id, rating, review_text } = req.body;
      const normalizedRating = Number(rating);

      if (!Number.isInteger(transporterId) || transporterId <= 0) {
        return res.status(400).json({ error: 'Invalid transporter id' });
      }

      if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
        return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
      }

      if (!shipment_id) {
        return res.status(400).json({ error: 'shipment_id is required to rate a transporter' });
      }

      await client.query('BEGIN');

      const transporterResult = await client.query(
        `SELECT id, name, region FROM users WHERE id = $1 AND role = 'transporter' AND is_active = true FOR UPDATE`,
        [transporterId]
      );

      if (transporterResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Transporter not found' });
      }

      if (shipment_id) {
        const shipmentResult = await client.query(
          `SELECT s.id, s.transporter_id, po.buyer_id
           FROM shipments s
           LEFT JOIN purchase_orders po ON s.order_id = po.id
           WHERE s.id = $1`,
          [shipment_id]
        );

        if (shipmentResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Shipment not found' });
        }

        const shipment = shipmentResult.rows[0];

        if (shipment.transporter_id !== transporterId) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Shipment is not assigned to this transporter' });
        }

        if (req.user.role === 'buyer' && Number(shipment.buyer_id) !== Number(req.user.id)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You can only rate your own shipment' });
        }
      }

      if (order_id) {
        const orderResult = await client.query(
          `SELECT id, buyer_id FROM purchase_orders WHERE id = $1`,
          [order_id]
        );

        if (orderResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Order not found' });
        }

        if (req.user.role === 'buyer' && Number(orderResult.rows[0].buyer_id) !== Number(req.user.id)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You can only rate your own order' });
        }
      }

      const insertResult = await client.query(
        `INSERT INTO transporter_ratings (
           transporter_id, shipment_id, order_id, rated_by, rating, review_text, region
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (shipment_id) DO UPDATE
           SET rating = EXCLUDED.rating,
               review_text = EXCLUDED.review_text,
               rated_by = EXCLUDED.rated_by,
               region = EXCLUDED.region,
               updated_at = NOW()
         RETURNING *`,
        [
          transporterId,
          shipment_id || null,
          order_id || null,
          req.user.id,
          normalizedRating,
          review_text ? String(review_text).trim() : null,
          transporterResult.rows[0].region || null
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Transporter rated successfully',
        rating: insertResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Rate transporter error:', error);
      res.status(500).json({ error: 'Failed to rate transporter' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;