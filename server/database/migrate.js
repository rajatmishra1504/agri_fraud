const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const schema = `
-- Drop existing tables (careful in production!)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS fraud_cases CASCADE;
DROP TABLE IF EXISTS fraud_flags CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('inspector', 'transporter', 'buyer', 'fraud_analyst', 'admin');
CREATE TYPE flag_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE flag_status AS ENUM ('OPEN', 'INVESTIGATING', 'CLOSED');
CREATE TYPE case_decision AS ENUM ('FRAUD', 'NOT_FRAUD', 'PENDING');
CREATE TYPE shipment_status AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    organization VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Batches table
CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) UNIQUE NOT NULL,
    farm_name VARCHAR(255) NOT NULL,
    farm_location VARCHAR(255) NOT NULL,
    product_type VARCHAR(100) NOT NULL,
    quantity_kg DECIMAL(10, 2) NOT NULL,
    harvest_date DATE NOT NULL,
    quality_grade VARCHAR(10),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batches_batch_number ON batches(batch_number);
CREATE INDEX idx_batches_product_type ON batches(product_type);
CREATE INDEX idx_batches_created_by ON batches(created_by);

-- Certificates table
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    cert_number VARCHAR(50) UNIQUE NOT NULL,
    cert_hash VARCHAR(64) UNIQUE NOT NULL,
    pdf_url TEXT,
    qr_code TEXT UNIQUE NOT NULL,
    inspector_notes TEXT,
    issued_by INTEGER REFERENCES users(id),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT true,
    revoked_at TIMESTAMP,
    revoked_by INTEGER REFERENCES users(id),
    revoke_reason TEXT
);

CREATE INDEX idx_certificates_cert_hash ON certificates(cert_hash);
CREATE INDEX idx_certificates_qr_code ON certificates(qr_code);
CREATE INDEX idx_certificates_batch_id ON certificates(batch_id);
CREATE INDEX idx_certificates_issued_by ON certificates(issued_by);

-- Shipments table
CREATE TABLE shipments (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    shipment_number VARCHAR(50) UNIQUE NOT NULL,
    from_location VARCHAR(255) NOT NULL,
    from_lat DECIMAL(10, 7),
    from_lng DECIMAL(10, 7),
    to_location VARCHAR(255) NOT NULL,
    to_lat DECIMAL(10, 7),
    to_lng DECIMAL(10, 7),
    distance_km DECIMAL(10, 2),
    weight_kg DECIMAL(10, 2) NOT NULL,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    status shipment_status DEFAULT 'PENDING',
    transporter_id INTEGER REFERENCES users(id),
    vehicle_number VARCHAR(50),
    temperature_log JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shipments_batch_id ON shipments(batch_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_transporter_id ON shipments(transporter_id);

-- Fraud Flags table
CREATE TABLE fraud_flags (
    id SERIAL PRIMARY KEY,
    flag_type VARCHAR(100) NOT NULL,
    severity flag_severity NOT NULL,
    batch_id INTEGER REFERENCES batches(id),
    cert_id INTEGER REFERENCES certificates(id),
    shipment_id INTEGER REFERENCES shipments(id),
    evidence_json JSONB NOT NULL,
    status flag_status DEFAULT 'OPEN',
    anomaly_score DECIMAL(5, 4),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fraud_flags_flag_type ON fraud_flags(flag_type);
CREATE INDEX idx_fraud_flags_severity ON fraud_flags(severity);
CREATE INDEX idx_fraud_flags_status ON fraud_flags(status);
CREATE INDEX idx_fraud_flags_batch_id ON fraud_flags(batch_id);

-- Fraud Cases table
CREATE TABLE fraud_cases (
    id SERIAL PRIMARY KEY,
    flag_id INTEGER REFERENCES fraud_flags(id) ON DELETE CASCADE,
    case_number VARCHAR(50) UNIQUE NOT NULL,
    assigned_to INTEGER REFERENCES users(id),
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    notes TEXT,
    investigation_data JSONB,
    decision case_decision DEFAULT 'PENDING',
    decision_reason TEXT,
    closed_at TIMESTAMP,
    closed_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fraud_cases_flag_id ON fraud_cases(flag_id);
CREATE INDEX idx_fraud_cases_assigned_to ON fraud_cases(assigned_to);
CREATE INDEX idx_fraud_cases_decision ON fraud_cases(decision);

-- Audit Logs table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fraud_flags_updated_at BEFORE UPDATE ON fraud_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fraud_cases_updated_at BEFORE UPDATE ON fraud_cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE VIEW active_fraud_flags AS
SELECT 
    ff.*,
    b.batch_number,
    b.product_type,
    c.cert_number,
    s.shipment_number,
    fc.case_number,
    fc.assigned_to,
    fc.decision
FROM fraud_flags ff
LEFT JOIN batches b ON ff.batch_id = b.id
LEFT JOIN certificates c ON ff.cert_id = c.id
LEFT JOIN shipments s ON ff.shipment_id = s.id
LEFT JOIN fraud_cases fc ON fc.flag_id = ff.id
WHERE ff.status != 'CLOSED';

CREATE VIEW fraud_statistics AS
SELECT 
    flag_type,
    severity,
    COUNT(*) as count,
    COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_count,
    COUNT(CASE WHEN status = 'INVESTIGATING' THEN 1 END) as investigating_count,
    COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as closed_count
FROM fraud_flags
GROUP BY flag_type, severity;
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting database migration...');
    
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('📊 Database schema created with:');
    console.log('   - Users, Batches, Certificates');
    console.log('   - Shipments, Fraud Flags, Fraud Cases');
    console.log('   - Audit Logs');
    console.log('   - Indexes and Views');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
