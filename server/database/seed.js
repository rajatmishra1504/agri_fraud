const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...');
    
    await client.query('BEGIN');
    
    // Create sample users
    const password = await bcrypt.hash('password123', 10);
    
    const users = await client.query(`
      INSERT INTO users (email, password_hash, role, name, organization)
      VALUES 
        ('admin@agri.com', $1, 'admin', 'Admin User', 'AgriGov'),
        ('inspector1@agri.com', $1, 'inspector', 'John Inspector', 'Quality Dept'),
        ('inspector2@agri.com', $1, 'inspector', 'Jane Inspector', 'Quality Dept'),
        ('transporter1@agri.com', $1, 'transporter', 'Mike Transport', 'FastLog'),
        ('analyst1@agri.com', $1, 'fraud_analyst', 'Sarah Analyst', 'Fraud Squad'),
        ('buyer1@agri.com', $1, 'buyer', 'Bob Buyer', 'SuperMart')
      RETURNING id, role
    `, [password]);
    
    console.log('✅ Created users:', users.rows.length);
    
    const inspectorId = users.rows.find(u => u.role === 'inspector').id;
    const transporterId = users.rows.find(u => u.role === 'transporter').id;
    const buyerId = users.rows.find(u => u.role === 'buyer').id;
    
    // Create sample batches
    const batches = await client.query(`
      INSERT INTO batches (batch_number, farm_name, farm_location, product_type, quantity_kg, harvest_date, quality_grade, created_by)
      VALUES 
        ('BATCH-2024-001', 'Green Valley Farm', 'Punjab, India', 'Wheat', 5000.00, '2024-01-15', 'A', $1),
        ('BATCH-2024-002', 'Sunrise Orchards', 'Maharashtra, India', 'Rice', 3000.00, '2024-01-20', 'A+', $1),
        ('BATCH-2024-003', 'Golden Fields', 'Haryana, India', 'Corn', 4500.00, '2024-02-01', 'B', $1),
        ('BATCH-2024-004', 'Fresh Harvest Co', 'Karnataka, India', 'Tomatoes', 2000.00, '2024-02-10', 'A', $1),
        ('BATCH-2024-005', 'Organic Valley', 'Kerala, India', 'Coconut', 1500.00, '2024-02-15', 'A+', $1)
      RETURNING id
    `, [inspectorId]);
    
    console.log('✅ Created batches:', batches.rows.length);
    
    // Create certificates for batches
    const crypto = require('crypto');
    
    for (const batch of batches.rows) {
      const certNumber = `CERT-${batch.id}-${Date.now()}`;
      const certHash = crypto.createHash('sha256').update(certNumber + batch.id).digest('hex');
      const qrCode = crypto.randomBytes(16).toString('hex');
      
      await client.query(`
        INSERT INTO certificates (batch_id, cert_number, cert_hash, qr_code, issued_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [batch.id, certNumber, certHash, qrCode, inspectorId]);
    }
    
    console.log('✅ Created certificates');
    
    // Create some shipments
    await client.query(`
      INSERT INTO shipments (batch_id, shipment_number, from_location, to_location, distance_km, weight_kg, shipped_at, delivered_at, status, transporter_id)
      VALUES 
        (1, 'SHIP-001', 'Punjab, India', 'Delhi, India', 350.5, 4980.00, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', 'DELIVERED', $1),
        (2, 'SHIP-002', 'Maharashtra, India', 'Mumbai, India', 420.0, 2990.00, NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', 'DELIVERED', $1),
        (3, 'SHIP-003', 'Haryana, India', 'Chandigarh, India', 180.0, 4500.00, NOW() - INTERVAL '1 day', NULL, 'IN_TRANSIT', $1)
    `, [transporterId]);
    
    console.log('✅ Created shipments');

    // Create sample purchase request
    await client.query(`
      INSERT INTO purchase_orders (
        order_number, buyer_id, batch_id, requested_quantity_kg,
        delivery_location, preferred_delivery_date,
        delivery_contact_name, delivery_contact_phone, delivery_instructions,
        notes, status
      )
      VALUES (
        $1, $2, 1, 1000.00,
        'Delhi Central Warehouse', CURRENT_DATE + INTERVAL '5 days',
        'Bob Buyer', '+911234567890', 'Call 30 mins before arrival',
        'Initial buyer request for wheat stock', 'REQUESTED'
      )
    `, [`ORD-${new Date().getFullYear()}-000001`, buyerId]);

    console.log('✅ Created purchase requests');
    
    // Create some fraud flags for demonstration
    await client.query(`
      INSERT INTO fraud_flags (flag_type, severity, batch_id, evidence_json, status, description)
      VALUES 
        ('ABNORMAL_WEIGHT', 'MEDIUM', 1, '{"expected_weight": 5000, "actual_weight": 4980, "variance_percent": 0.4}', 'OPEN', 'Weight loss detected during shipment'),
        ('IMPOSSIBLE_TRAVEL', 'HIGH', 2, '{"distance_km": 420, "time_hours": 2, "min_hours": 6}', 'INVESTIGATING', 'Delivery too fast for distance')
    `);
    
    console.log('✅ Created fraud flags');
    
    await client.query('COMMIT');
    console.log('🎉 Database seeding completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
