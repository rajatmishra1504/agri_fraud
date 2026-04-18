const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

router.get('/marketplace', authenticateToken, async (req, res) => {
  try {
    const { region = '' } = req.query;
    const params = [];
    const filters = [`u.role = 'transporter'`, `u.is_active = true`];

    if (String(region || '').trim()) {
      params.push(String(region).trim());
      filters.push(`COALESCE(LOWER(TRIM(u.region)), '') = LOWER(TRIM($${params.length}))`);
    }

    const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.region,
         u.organization,
         u.created_at,
         COALESCE((
           SELECT AVG(r.rating)
           FROM transporter_ratings r
           WHERE r.transporter_id = u.id
         ), 0)::numeric(4,2) AS rating,
         COALESCE((
           SELECT COUNT(*)
           FROM transporter_ratings r
           WHERE r.transporter_id = u.id
         ), 0)::int AS rating_count,
         COALESCE((
           SELECT COUNT(*)
           FROM shipments s
           WHERE s.transporter_id = u.id AND s.status = 'DELIVERED'
         ), 0)::int AS completed_shipments,
         COALESCE((
           SELECT COUNT(*)
           FROM shipments s
           WHERE s.transporter_id = u.id AND s.status IN ('PENDING', 'IN_TRANSIT')
         ), 0)::int AS active_shipments
       FROM users u
       WHERE ${filters.join(' AND ')}
       ORDER BY rating DESC, rating_count DESC, completed_shipments DESC, u.name ASC`,
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