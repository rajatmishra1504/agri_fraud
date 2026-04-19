const express = require('express');
const router = express.Router();
const pool = require('../database/db');

router.get('/landing-insights', async (req, res) => {
  try {
    const [availableBatchesResult, fraudPulseResult, recentActivityResult] = await Promise.all([
      pool.query(
        `SELECT
           b.id,
           b.batch_number,
           b.product_type,
           b.region,
           b.quality_grade,
           COALESCE(b.batch_unit, 'kg') AS batch_unit,
           GREATEST(
             COALESCE(b.quantity_kg, 0) - COALESCE((
               SELECT SUM(po.requested_quantity_kg)
               FROM purchase_orders po
               WHERE po.batch_id = b.id
                 AND po.status IN ('REQUESTED', 'APPROVED', 'FULFILLED')
             ), 0),
             0
           ) AS available_quantity_kg,
           EXISTS (
             SELECT 1
             FROM certificates c
             WHERE c.batch_id = b.id
               AND c.is_valid = true
           ) AS has_valid_certificate
         FROM batches b
         WHERE COALESCE(b.is_deleted, false) = false
         ORDER BY available_quantity_kg DESC, b.created_at DESC
         LIMIT 6`
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM fraud_flags WHERE status = 'OPEN')::int AS open_flags,
           (SELECT COUNT(*) FROM fraud_flags WHERE status = 'INVESTIGATING')::int AS investigating_flags,
           (SELECT COUNT(*) FROM fraud_flags WHERE severity IN ('HIGH', 'CRITICAL'))::int AS high_critical_flags,
           (SELECT COUNT(*) FROM fraud_cases WHERE decision = 'PENDING')::int AS pending_cases`
      ),
      pool.query(
        `SELECT *
         FROM (
           SELECT
             c.issued_at AS activity_time,
             'CERTIFICATE_ISSUED' AS activity_type,
             CONCAT('Certificate ', c.cert_number, ' issued for ', b.batch_number) AS description,
             COALESCE(b.region, b.farm_location, 'Unknown region') AS region,
             'LOW'::text AS severity
           FROM certificates c
           LEFT JOIN batches b ON b.id = c.batch_id

           UNION ALL

           SELECT
             ff.created_at AS activity_time,
             'FRAUD_FLAGGED' AS activity_type,
             CONCAT('Flag ', ff.flag_type, ' raised for ', COALESCE(b.batch_number, 'unknown batch')) AS description,
             COALESCE(b.region, b.farm_location, 'Unknown region') AS region,
             ff.severity::text AS severity
           FROM fraud_flags ff
           LEFT JOIN batches b ON b.id = ff.batch_id

           UNION ALL

           SELECT
             fc.created_at AS activity_time,
             'CASE_OPENED' AS activity_type,
             CONCAT('Case ', fc.case_number, ' opened') AS description,
             COALESCE(b.region, b.farm_location, 'Unknown region') AS region,
             CASE WHEN ff.severity IS NULL THEN 'MEDIUM' ELSE ff.severity::text END AS severity
           FROM fraud_cases fc
           LEFT JOIN fraud_flags ff ON ff.id = fc.flag_id
           LEFT JOIN batches b ON b.id = ff.batch_id
         ) activity
         ORDER BY activity.activity_time DESC
         LIMIT 8`
      )
    ]);

    const pulse = fraudPulseResult.rows[0] || {
      open_flags: 0,
      investigating_flags: 0,
      high_critical_flags: 0,
      pending_cases: 0
    };

    res.json({
      available_batches: availableBatchesResult.rows || [],
      fraud_pulse: {
        open_flags: Number(pulse.open_flags || 0),
        investigating_flags: Number(pulse.investigating_flags || 0),
        high_critical_flags: Number(pulse.high_critical_flags || 0),
        pending_cases: Number(pulse.pending_cases || 0),
        refreshed_at: new Date().toISOString()
      },
      recent_activity: recentActivityResult.rows || []
    });
  } catch (error) {
    console.error('Get landing insights error:', error);
    res.status(500).json({ error: 'Failed to load landing insights' });
  }
});

module.exports = router;
