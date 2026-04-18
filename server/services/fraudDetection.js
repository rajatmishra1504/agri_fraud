const pool = require('../database/db');

class FraudDetectionEngine {
  constructor() {
    this.thresholds = {
      weightChange: parseFloat(process.env.WEIGHT_CHANGE_THRESHOLD) || 15,
      minTravelSpeed: parseFloat(process.env.MIN_TRAVEL_SPEED_KMH) || 40,
      maxTravelSpeed: parseFloat(process.env.MAX_TRAVEL_SPEED_KMH) || 120
    };
  }

  severityRank(severity) {
    const normalizedSeverity = String(severity || '').toUpperCase();
    if (normalizedSeverity === 'CRITICAL') return 4;
    if (normalizedSeverity === 'HIGH') return 3;
    if (normalizedSeverity === 'MEDIUM') return 2;
    if (normalizedSeverity === 'LOW') return 1;
    return 0;
  }

  mergeEvidenceCauses(causes) {
    return {
      detection_time: new Date().toISOString(),
      causes
    };
  }

  buildShipmentAnomalyDescription(causes) {
    return causes.map((cause) => cause.description).join('; ');
  }

  buildShipmentAnomalyScore(causes) {
    const strongestSeverity = causes.reduce((max, cause) => Math.max(max, this.severityRank(cause.severity)), 0);
    const baseScore = strongestSeverity / 4;
    const bonus = Math.min((causes.length - 1) * 0.1, 0.2);
    return parseFloat(Math.min(baseScore + bonus, 1).toFixed(4));
  }

  buildFraudCancellationReason(description) {
    const normalizedDescription = String(description || 'Fraud anomaly detected').trim();
    return `Cancelled due to fraud flag: ${normalizedDescription}`;
  }

  async cancelDeliveredShipmentForFraud({ db, shipmentId, reason }) {
    const shipmentResult = await db.query(
      `SELECT id, status, order_id, delivery_notes
       FROM shipments
       WHERE id = $1
       FOR UPDATE`,
      [shipmentId]
    );

    if (shipmentResult.rows.length === 0) return { cancelled: false };

    const shipment = shipmentResult.rows[0];
    if (shipment.status !== 'DELIVERED') return { cancelled: false };

    const cancellationNote = `FRAUD AUTO-CANCELLATION: ${reason}`;

    await db.query(
      `UPDATE shipments
       SET status = 'CANCELLED'::shipment_status,
           delivery_notes = CASE
             WHEN delivery_notes IS NULL OR delivery_notes = '' THEN $2
             ELSE delivery_notes || ' | ' || $2
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [shipmentId, cancellationNote]
    );

    if (shipment.order_id) {
      await db.query(
        `UPDATE purchase_orders
         SET status = 'CANCELLED'::order_status,
             rejection_reason = CASE
               WHEN COALESCE(TRIM(rejection_reason), '') = '' THEN $2
               ELSE rejection_reason || ' | ' || $2
             END,
             reviewed_at = COALESCE(reviewed_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
           AND status <> 'CANCELLED'::order_status`,
        [shipment.order_id, reason]
      );
    }

    return { cancelled: true, orderId: shipment.order_id || null };
  }

  async recordShipmentAnomaly(cause) {
    const db = cause.dbClient || pool;
    const normalizedCause = {
      type: String(cause.cause_type || 'SHIPMENT_ANOMALY').trim() || 'SHIPMENT_ANOMALY',
      severity: String(cause.severity || 'MEDIUM').toUpperCase(),
      description: String(cause.cause_description || cause.description || 'Shipment anomaly detected').trim(),
      evidence: cause.evidence_json || cause.evidence || {}
    };

    const result = await db.query(
      `SELECT
         ff.id,
         ff.flag_type,
         ff.severity,
         ff.batch_id,
         ff.shipment_id,
         ff.evidence_json,
         ff.description,
         ff.status,
         ff.anomaly_score,
         ff.created_at,
         s.shipment_number
       FROM fraud_flags ff
       LEFT JOIN shipments s ON s.id = ff.shipment_id
       WHERE ff.shipment_id = $1
         AND ff.flag_type IN ('IMPOSSIBLE_TRAVEL', 'ABNORMAL_WEIGHT', 'ABNORMAL_WEIGHT_CHANGE', 'ML_PATTERN_ANOMALY', 'SHIPMENT_ANOMALY')
       ORDER BY ff.created_at ASC, ff.id ASC`,
      [cause.shipment_id]
    );

    const existingRows = result.rows;
    const shipmentNumber = cause.shipment_number || existingRows[0]?.shipment_number || null;
    const batchId = cause.batch_id || existingRows[0]?.batch_id || null;
    const primary = existingRows.find((row) => row.flag_type === 'SHIPMENT_ANOMALY') || existingRows[0] || null;

    const existingCauses = existingRows.flatMap((row) => {
      const evidenceCauses = Array.isArray(row.evidence_json?.causes) ? row.evidence_json.causes : null;
      if (evidenceCauses && evidenceCauses.length > 0) {
        return evidenceCauses;
      }

      return [{
        type: row.flag_type,
        severity: row.severity,
        description: row.description,
        evidence: row.evidence_json,
        created_at: row.created_at
      }];
    });

    const mergedCauseList = [...existingCauses, normalizedCause]
      .filter((item) => item && item.type && item.description)
      .reduce((accumulator, item) => {
        const signature = `${String(item.type).toUpperCase()}|${String(item.description).trim()}`;
        if (!accumulator.seen.has(signature)) {
          accumulator.seen.add(signature);
          accumulator.items.push(item);
        }
        return accumulator;
      }, { seen: new Set(), items: [] }).items;

    const mergedEvidence = {
      shipment_id: cause.shipment_id,
      batch_id: batchId,
      shipment_number: shipmentNumber,
      detection_time: new Date().toISOString(),
      causes: mergedCauseList
    };

    const mergedDescription = this.buildShipmentAnomalyDescription(mergedCauseList);
    const mergedSeverity = mergedCauseList.reduce((highest, item) => (
      this.severityRank(item.severity) > this.severityRank(highest) ? item.severity : highest
    ), 'LOW');
    const mergedScore = this.buildShipmentAnomalyScore(mergedCauseList);

    if (primary) {
      const updateResult = await db.query(
        `UPDATE fraud_flags
         SET flag_type = 'SHIPMENT_ANOMALY',
             severity = $2,
             batch_id = $3,
             evidence_json = $4,
             description = $5,
             anomaly_score = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          primary.id,
          mergedSeverity,
          batchId,
          JSON.stringify(mergedEvidence),
          mergedDescription,
          mergedScore
        ]
      );

      const duplicateIds = existingRows
        .filter((row) => row.id !== primary.id)
        .map((row) => row.id);

      if (duplicateIds.length > 0) {
        await db.query(
          `UPDATE fraud_cases
           SET flag_id = $1
           WHERE flag_id = ANY($2::int[])`,
          [primary.id, duplicateIds]
        );

          await db.query(
          `DELETE FROM fraud_flags
           WHERE id = ANY($1::int[])`,
          [duplicateIds]
        );
      }

      if (['OPEN', 'INVESTIGATING'].includes(String(updateResult.rows[0]?.status || '').toUpperCase())) {
        const cancellationReason = this.buildFraudCancellationReason(mergedDescription);
        await this.cancelDeliveredShipmentForFraud({
          db,
          shipmentId: cause.shipment_id,
          reason: cancellationReason
        });
      }

      return updateResult.rows[0];
    }

    const insertResult = await db.query(
      `INSERT INTO fraud_flags (
         flag_type, severity, batch_id, shipment_id,
         evidence_json, description, status, anomaly_score
       )
       VALUES ('SHIPMENT_ANOMALY', $1, $2, $3, $4, $5, 'OPEN', $6)
       RETURNING *`,
      [
        mergedSeverity,
        batchId,
        cause.shipment_id,
        JSON.stringify(mergedEvidence),
        mergedDescription,
        mergedScore
      ]
    );

    if (['OPEN', 'INVESTIGATING'].includes(String(insertResult.rows[0]?.status || '').toUpperCase())) {
      const cancellationReason = this.buildFraudCancellationReason(mergedDescription);
      await this.cancelDeliveredShipmentForFraud({
        db,
        shipmentId: cause.shipment_id,
        reason: cancellationReason
      });
    }

    return insertResult.rows[0];
  }

  async scanAllBatches() {
    console.log('🔍 Starting fraud detection scan...');
    const results = {
      certificateReuse: await this.detectCertificateReuse(),
      doubleDelivery: await this.detectDoubleDelivery(),
      shipmentAnomalies: await this.detectShipmentAnomalies(),
      suspiciousInspector: await this.detectSuspiciousInspector()
    };
    
    console.log('✅ Fraud scan complete:', results);
    return results;
  }

  async normalizeExistingShipmentAnomalies() {
    const result = await pool.query(
      `SELECT
         ff.id,
         ff.flag_type,
         ff.severity,
         ff.batch_id,
         ff.shipment_id,
         ff.evidence_json,
         ff.description,
         ff.status,
         ff.anomaly_score,
         ff.created_at,
         s.shipment_number,
         s.from_location,
         s.to_location,
         s.distance_km,
         s.weight_kg,
         s.shipped_at,
         s.delivered_at
       FROM fraud_flags ff
       LEFT JOIN shipments s ON s.id = ff.shipment_id
       WHERE ff.shipment_id IS NOT NULL
         AND ff.flag_type IN ('IMPOSSIBLE_TRAVEL', 'ABNORMAL_WEIGHT', 'ABNORMAL_WEIGHT_CHANGE', 'ML_PATTERN_ANOMALY', 'SHIPMENT_ANOMALY')
       ORDER BY ff.shipment_id ASC, ff.created_at ASC, ff.id ASC`
    );

    const grouped = new Map();
    for (const row of result.rows) {
      if (!grouped.has(row.shipment_id)) {
        grouped.set(row.shipment_id, []);
      }
      grouped.get(row.shipment_id).push(row);
    }

    const normalizedFlags = [];

    for (const rows of grouped.values()) {
      const primary = rows.find((row) => row.flag_type === 'SHIPMENT_ANOMALY') || rows[0];
      const causes = rows.map((row) => ({
        flag_id: row.id,
        flag_type: row.flag_type,
        severity: row.severity,
        description: row.description,
        evidence: row.evidence_json,
        created_at: row.created_at
      }));
      const mergedEvidence = this.mergeEvidenceCauses(causes);
      const mergedDescription = this.buildShipmentAnomalyDescription(causes);
      const mergedSeverity = rows.reduce((highest, row) => (
        this.severityRank(row.severity) > this.severityRank(highest) ? row.severity : highest
      ), primary.severity || 'MEDIUM');
      const mergedScore = this.buildShipmentAnomalyScore(causes);

      await pool.query(
        `UPDATE fraud_flags
         SET flag_type = 'SHIPMENT_ANOMALY',
             severity = $2,
             batch_id = $3,
             evidence_json = $4,
             description = $5,
             anomaly_score = $6,
             updated_at = NOW()
         WHERE id = $1`,
        [
          primary.id,
          mergedSeverity,
          primary.batch_id,
          JSON.stringify(mergedEvidence),
          mergedDescription,
          mergedScore
        ]
      );

      const duplicateIds = rows
        .filter((row) => row.id !== primary.id)
        .map((row) => row.id);

      if (duplicateIds.length > 0) {
        await pool.query(
          `UPDATE fraud_cases
           SET flag_id = $1
           WHERE flag_id = ANY($2::int[])`,
          [primary.id, duplicateIds]
        );

        await pool.query(
          `DELETE FROM fraud_flags
           WHERE id = ANY($1::int[])`,
          [duplicateIds]
        );
      }

      normalizedFlags.push(primary.id);
    }

    return normalizedFlags;
  }

  async detectCertificateReuse() {
    const query = `
      SELECT cert_hash, COUNT(*) as usage_count, 
             ARRAY_AGG(id) as cert_ids,
             ARRAY_AGG(batch_id) as batch_ids
      FROM certificates
      WHERE is_valid = true
      GROUP BY cert_hash
      HAVING COUNT(*) > 1
    `;
    
    const result = await pool.query(query);
    const flagsCreated = [];
    
    for (const row of result.rows) {
      const evidence = {
        cert_hash: row.cert_hash,
        certificate_ids: row.cert_ids,
        batch_ids: row.batch_ids,
        usage_count: row.usage_count,
        detection_time: new Date().toISOString()
      };
      
      // Create fraud flag for each certificate after the first
      for (let i = 1; i < row.cert_ids.length; i++) {
        const flag = await this.createFraudFlag({
          flag_type: 'CERTIFICATE_REUSE',
          severity: 'HIGH',
          cert_id: row.cert_ids[i],
          batch_id: row.batch_ids[i],
          evidence_json: evidence,
          description: `Certificate hash ${row.cert_hash.slice(0, 16)}... used ${row.usage_count} times`
        });
        flagsCreated.push(flag);
      }
    }
    
    return flagsCreated;
  }

  async detectDoubleDelivery() {
    const query = `
      SELECT batch_id, COUNT(*) as delivery_count,
             ARRAY_AGG(id) as shipment_ids,
             ARRAY_AGG(to_location) as destinations,
             ARRAY_AGG(delivered_at) as delivery_times
      FROM shipments
      WHERE status = 'DELIVERED' AND delivered_at IS NOT NULL
      GROUP BY batch_id
      HAVING COUNT(*) > 1
    `;
    
    const result = await pool.query(query);
    const flagsCreated = [];
    
    for (const row of result.rows) {
      // Check if deliveries are to different locations
      const uniqueLocations = new Set(row.destinations);
      if (uniqueLocations.size > 1) {
        const evidence = {
          batch_id: row.batch_id,
          shipment_ids: row.shipment_ids,
          destinations: row.destinations,
          delivery_times: row.delivery_times,
          delivery_count: row.delivery_count,
          detection_time: new Date().toISOString()
        };
        
        const flag = await this.createFraudFlag({
          flag_type: 'DOUBLE_DELIVERY',
          severity: 'HIGH',
          batch_id: row.batch_id,
          shipment_id: row.shipment_ids[row.shipment_ids.length - 1],
          evidence_json: evidence,
          description: `Batch delivered ${row.delivery_count} times to different locations`
        });
        flagsCreated.push(flag);
      }
    }
    
    return flagsCreated;
  }

  async detectImpossibleTravel() {
    const query = `
      SELECT id, batch_id, distance_km, shipped_at, delivered_at,
             from_location, to_location, shipment_number
      FROM shipments
      WHERE status = 'DELIVERED' 
        AND shipped_at IS NOT NULL 
        AND delivered_at IS NOT NULL
        AND distance_km IS NOT NULL
    `;
    
    const result = await pool.query(query);
    const findings = [];
    
    for (const shipment of result.rows) {
      const travelTimeHours = (new Date(shipment.delivered_at) - new Date(shipment.shipped_at)) / (1000 * 60 * 60);
      const avgSpeedKmh = shipment.distance_km / travelTimeHours;
      
      const minTimeRequired = shipment.distance_km / this.thresholds.maxTravelSpeed;
      
      let severity = null;
      if (avgSpeedKmh > this.thresholds.maxTravelSpeed) {
        severity = 'HIGH';
      } else if (travelTimeHours < minTimeRequired) {
        severity = 'MEDIUM';
      }
      
      if (severity) {
        const evidence = {
          shipment_id: shipment.id,
          distance_km: shipment.distance_km,
          travel_time_hours: parseFloat(travelTimeHours.toFixed(2)),
          average_speed_kmh: parseFloat(avgSpeedKmh.toFixed(2)),
          max_allowed_speed: this.thresholds.maxTravelSpeed,
          min_required_hours: parseFloat(minTimeRequired.toFixed(2)),
          from_location: shipment.from_location,
          to_location: shipment.to_location,
          detection_time: new Date().toISOString()
        };

        findings.push({
          shipment_id: shipment.id,
          batch_id: shipment.batch_id,
          shipment_number: shipment.shipment_number,
          severity,
          cause_type: 'IMPOSSIBLE_TRAVEL',
          cause_description: `Travel time impossibly short: ${avgSpeedKmh.toFixed(0)} km/h average speed`,
          evidence_json: evidence
        });
      }
    }

    return findings;
  }

  async detectAbnormalWeight() {
    const query = `
      SELECT s.id, s.batch_id, s.weight_kg, s.shipment_number,
             b.quantity_kg as original_weight, b.batch_number
      FROM shipments s
      JOIN batches b ON s.batch_id = b.id
      WHERE s.status = 'DELIVERED'
    `;
    
    const result = await pool.query(query);
    const findings = [];
    
    for (const shipment of result.rows) {
      const weightChange = ((shipment.original_weight - shipment.weight_kg) / shipment.original_weight) * 100;
      const absWeightChange = Math.abs(weightChange);
      
      if (absWeightChange > this.thresholds.weightChange) {
        const severity = absWeightChange > 25 ? 'HIGH' : 'MEDIUM';
        
        const evidence = {
          shipment_id: shipment.id,
          original_weight_kg: parseFloat(shipment.original_weight),
          delivered_weight_kg: parseFloat(shipment.weight_kg),
          weight_change_percent: parseFloat(weightChange.toFixed(2)),
          threshold_percent: this.thresholds.weightChange,
          detection_time: new Date().toISOString()
        };

        findings.push({
          shipment_id: shipment.id,
          batch_id: shipment.batch_id,
          shipment_number: shipment.shipment_number,
          severity,
          cause_type: 'ABNORMAL_WEIGHT',
          cause_description: `Weight change of ${Math.abs(weightChange).toFixed(1)}% exceeds threshold`,
          evidence_json: evidence
        });
      }
    }

    return findings;
  }

  async detectShipmentAnomalies() {
    await this.normalizeExistingShipmentAnomalies();

    const impossibleTravelFindings = await this.detectImpossibleTravel();
    const abnormalWeightFindings = await this.detectAbnormalWeight();

    const upsertedFlags = [];

    for (const finding of [...impossibleTravelFindings, ...abnormalWeightFindings]) {
      const flag = await this.recordShipmentAnomaly(finding);
      upsertedFlags.push(flag);
    }

    return upsertedFlags;
  }

  async detectSuspiciousInspector() {
    const query = `
      SELECT b.created_by as inspector_id, u.name as inspector_name,
             b.quality_grade, COUNT(*) as grade_count,
             COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY b.created_by) as percentage
      FROM batches b
      JOIN users u ON b.created_by = u.id
      WHERE b.quality_grade IS NOT NULL
      GROUP BY b.created_by, u.name, b.quality_grade
      HAVING COUNT(*) > 5
    `;
    
    const result = await pool.query(query);
    const flagsCreated = [];
    
    // Group by inspector
    const inspectorData = {};
    for (const row of result.rows) {
      if (!inspectorData[row.inspector_id]) {
        inspectorData[row.inspector_id] = {
          inspector_name: row.inspector_name,
          grades: []
        };
      }
      inspectorData[row.inspector_id].grades.push({
        grade: row.quality_grade,
        count: row.grade_count,
        percentage: parseFloat(row.percentage)
      });
    }
    
    // Check for inspectors giving same grade >80% of time
    for (const [inspectorId, data] of Object.entries(inspectorData)) {
      const dominantGrade = data.grades.find(g => g.percentage > 80);
      
      if (dominantGrade) {
        const evidence = {
          inspector_id: parseInt(inspectorId),
          inspector_name: data.inspector_name,
          dominant_grade: dominantGrade.grade,
          grade_percentage: dominantGrade.percentage,
          all_grades: data.grades,
          detection_time: new Date().toISOString()
        };
        
        const flag = await this.createFraudFlag({
          flag_type: 'SUSPICIOUS_INSPECTOR',
          severity: 'MEDIUM',
          evidence_json: evidence,
          description: `Inspector giving grade ${dominantGrade.grade} ${dominantGrade.percentage.toFixed(0)}% of the time`
        });
        flagsCreated.push(flag);
      }
    }
    
    return flagsCreated;
  }

  async createFraudFlag(flagData) {
    const result = await pool.query(`
      INSERT INTO fraud_flags (
        flag_type, severity, batch_id, cert_id, shipment_id,
        evidence_json, description, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
      RETURNING *
    `, [
      flagData.flag_type,
      flagData.severity,
      flagData.batch_id || null,
      flagData.cert_id || null,
      flagData.shipment_id || null,
      JSON.stringify(flagData.evidence_json),
      flagData.description
    ]);

    const flag = result.rows[0];

    // ✅ AUTOMATIC REVOCATION: If flag is HIGH severity, invalidate associated certificates
    if (flag.severity === 'HIGH') {
      try {
        if (flag.cert_id) {
          await pool.query(
            `UPDATE certificates SET is_valid = false, revoke_reason = $1, revoked_at = NOW() WHERE id = $2`,
            [`Auto-revoked: ${flag.description}`, flag.cert_id]
          );
        } else if (flag.batch_id) {
          // If flag is on a batch, invalidate ALL certificates for that batch
          await pool.query(
            `UPDATE certificates SET is_valid = false, revoke_reason = $1, revoked_at = NOW() WHERE batch_id = $2`,
            [`Auto-revoked due to batch fraud: ${flag.description}`, flag.batch_id]
          );
        }
      } catch (err) {
        console.error('Failed to auto-revoke certificates:', err);
      }
    }
    
    return flag;
  }

  async calculateAnomalyScore(shipmentData) {
    // Simple anomaly detection using Z-score
    // In production, this could use Isolation Forest or other ML models
    
    const query = `
      SELECT 
        AVG(distance_km) as avg_distance,
        STDDEV(distance_km) as stddev_distance,
        AVG(weight_kg) as avg_weight,
        STDDEV(weight_kg) as stddev_weight
      FROM shipments
      WHERE status = 'DELIVERED'
    `;
    
    const stats = await pool.query(query);
    const { avg_distance, stddev_distance, avg_weight, stddev_weight } = stats.rows[0];
    
    if (!stddev_distance || !stddev_weight) return 0;
    
    const distanceZScore = Math.abs((shipmentData.distance_km - avg_distance) / stddev_distance);
    const weightZScore = Math.abs((shipmentData.weight_kg - avg_weight) / stddev_weight);
    
    // Normalize to 0-1 scale
    const maxZScore = Math.max(distanceZScore, weightZScore);
    const anomalyScore = Math.min(maxZScore / 3, 1); // 3 standard deviations = score of 1
    
    return parseFloat(anomalyScore.toFixed(4));
  }
}

module.exports = new FraudDetectionEngine();
