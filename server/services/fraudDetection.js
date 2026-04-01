const pool = require('../database/db');

class FraudDetectionEngine {
  constructor() {
    this.thresholds = {
      weightChange: parseFloat(process.env.WEIGHT_CHANGE_THRESHOLD) || 15,
      minTravelSpeed: parseFloat(process.env.MIN_TRAVEL_SPEED_KMH) || 40,
      maxTravelSpeed: parseFloat(process.env.MAX_TRAVEL_SPEED_KMH) || 120
    };
  }

  async scanAllBatches() {
    console.log('🔍 Starting fraud detection scan...');
    const results = {
      certificateReuse: await this.detectCertificateReuse(),
      doubleDelivery: await this.detectDoubleDelivery(),
      impossibleTravel: await this.detectImpossibleTravel(),
      abnormalWeight: await this.detectAbnormalWeight(),
      suspiciousInspector: await this.detectSuspiciousInspector()
    };
    
    console.log('✅ Fraud scan complete:', results);
    return results;
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
    const flagsCreated = [];
    
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
        
        // Check if flag already exists
        const existingFlag = await pool.query(
          `SELECT id FROM fraud_flags 
           WHERE shipment_id = $1 AND flag_type = 'IMPOSSIBLE_TRAVEL'`,
          [shipment.id]
        );
        
        if (existingFlag.rows.length === 0) {
          const flag = await this.createFraudFlag({
            flag_type: 'IMPOSSIBLE_TRAVEL',
            severity,
            batch_id: shipment.batch_id,
            shipment_id: shipment.id,
            evidence_json: evidence,
            description: `Travel time impossibly short: ${avgSpeedKmh.toFixed(0)} km/h average speed`
          });
          flagsCreated.push(flag);
        }
      }
    }
    
    return flagsCreated;
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
    const flagsCreated = [];
    
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
        
        // Check if flag already exists
        const existingFlag = await pool.query(
          `SELECT id FROM fraud_flags 
           WHERE shipment_id = $1 AND flag_type = 'ABNORMAL_WEIGHT'`,
          [shipment.id]
        );
        
        if (existingFlag.rows.length === 0) {
          const flag = await this.createFraudFlag({
            flag_type: 'ABNORMAL_WEIGHT',
            severity,
            batch_id: shipment.batch_id,
            shipment_id: shipment.id,
            evidence_json: evidence,
            description: `Weight change of ${Math.abs(weightChange).toFixed(1)}% exceeds threshold`
          });
          flagsCreated.push(flag);
        }
      }
    }
    
    return flagsCreated;
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
    
    return result.rows[0];
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
