const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const fraudEngine = require('../services/fraudDetection');

// ❌ REMOVED WRONG FRONTEND FUNCTION
// const updateTransit = async (id, status) => {}



router.post('/',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  auditLog('CREATE_SHIPMENT', 'shipment'),
  async (req, res) => {
    try {
      const {
        batch_id, from_location, to_location, distance_km,
        weight_kg, vehicle_number, from_lat, from_lng, to_lat, to_lng
      } = req.body;
      
      const shipmentNumber = `SHIP-${Date.now().toString().slice(-8)}`;
      
      const result = await pool.query(`
        INSERT INTO shipments (
          batch_id, shipment_number, from_location, to_location,
          distance_km, weight_kg, transporter_id, vehicle_number,
          from_lat, from_lng, to_lat, to_lng, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING')
        RETURNING *
      `, [
        batch_id,
        shipmentNumber,
        from_location,
        to_location,
        distance_km,
        weight_kg,
        req.user.id,
        vehicle_number,
        from_lat,
        from_lng,
        to_lat,
        to_lng
      ]);
      
      res.status(201).json({
        message: 'Shipment created successfully',
        shipment: result.rows[0]
      });

    } catch (error) {
      console.error('Create shipment error:', error);
      res.status(500).json({ error: 'Failed to create shipment' });
    }
  }
);



router.put('/:id',
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  auditLog('UPDATE_SHIPMENT', 'shipment'),
  async (req, res) => {
    try {

      const { id } = req.params;
      const { status, delivered_at, weight_kg } = req.body;
      
      let query = 'UPDATE shipments SET status = $1';
      const params = [status];
      
      if (status === 'DELIVERED' && delivered_at) {
        query += ', delivered_at = $2';
        params.push(delivered_at);
      }
      
      if (weight_kg) {
        query += `, weight_kg = $${params.length + 1}`;
        params.push(weight_kg);
      }
      
      query += ` WHERE id = $${params.length + 1} RETURNING *`;
      params.push(id);
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Shipment not found'
        });
      }
      
      res.json({
        message: 'Shipment updated successfully',
        shipment: result.rows[0]
      });

    } catch (error) {
      console.error('Update shipment error:', error);
      res.status(500).json({
        error: 'Failed to update shipment'
      });
    }
  }
);



router.get('/',
  authenticateToken,
  async (req, res) => {
    try {

      const result = await pool.query(`
        SELECT s.*, b.batch_number, b.product_type,
               u.name as transporter_name
        FROM shipments s
        LEFT JOIN batches b
          ON s.batch_id = b.id
        LEFT JOIN users u
          ON s.transporter_id = u.id
        ORDER BY s.created_at DESC
        LIMIT 100
      `);
      
      res.json({
        shipments: result.rows
      });

    } catch (error) {
      console.error('Get shipments error:', error);
      res.status(500).json({
        error: 'Failed to fetch shipments'
      });
    }
  }
);



// ✅ NEW ROUTE (ADDED — NOT MODIFYING OLD ONES)

router.post(
  "/:id/status",
  authenticateToken,
  authorizeRoles('transporter', 'admin'),
  auditLog('UPDATE_SHIPMENT', 'shipment'),
  async (req, res) => {

    try {

      const { id } = req.params;
      const { status } = req.body;

      let updateQuery = `
        UPDATE shipments
        SET status = $1,
            updated_at = NOW()
      `;

      if (status === 'DELIVERED') {
         updateQuery += `, delivered_at = NOW() `;
      } else if (status === 'IN_TRANSIT') {
         updateQuery += `, shipped_at = NOW() `;
      }

      updateQuery += ` WHERE id = $2 RETURNING *`;

      const result = await pool.query(updateQuery, [status, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Shipment not found"
        });
      }

      // If status is DELIVERED, run the fraud detection engine to check travel times 
      if (status === 'DELIVERED') {
        // Run scan asynchronously without blocking the response
        setTimeout(() => {
          fraudEngine.scanAllBatches().catch(err => console.error('Auto fraud scan failed:', err));
        }, 100);
      }

      res.json(result.rows[0]);

    } catch (err) {

      console.log(err);

      res.status(500).json({
        error: "Update failed"
      });

    }

  }
);



module.exports = router;
