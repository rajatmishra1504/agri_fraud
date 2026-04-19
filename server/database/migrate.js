const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

const pool = new Pool(poolConfig);

const schema = `
-- Create ENUM types idempotently
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('inspector', 'transporter', 'buyer', 'fraud_analyst', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flag_severity') THEN
        CREATE TYPE flag_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flag_status') THEN
        CREATE TYPE flag_status AS ENUM ('OPEN', 'INVESTIGATING', 'CLOSED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_decision') THEN
        CREATE TYPE case_decision AS ENUM ('FRAUD', 'NOT_FRAUD', 'PENDING');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shipment_status') THEN
        CREATE TYPE shipment_status AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');
    END IF;
END$$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    organization VARCHAR(255),
    region VARCHAR(100),
    transporter_source_state VARCHAR(100),
    transporter_destination_states TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region);
CREATE INDEX IF NOT EXISTS idx_users_transporter_source_state ON users(transporter_source_state);
CREATE INDEX IF NOT EXISTS idx_users_transporter_destination_states ON users USING GIN (transporter_destination_states);

-- Batches table
CREATE TABLE IF NOT EXISTS batches (
    id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) UNIQUE NOT NULL,
    farm_name VARCHAR(255) NOT NULL,
    farm_location VARCHAR(255) NOT NULL,
    region VARCHAR(100),
    product_type VARCHAR(100) NOT NULL,
    quantity_kg DECIMAL(10, 2) NOT NULL,
    batch_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    harvest_date DATE NOT NULL,
    quality_grade VARCHAR(10),
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    deleted_by INTEGER REFERENCES users(id),
    delete_reason TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batches_batch_number ON batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_product_type ON batches(product_type);
CREATE INDEX IF NOT EXISTS idx_batches_created_by ON batches(created_by);
CREATE INDEX IF NOT EXISTS idx_batches_region ON batches(region);
CREATE INDEX IF NOT EXISTS idx_batches_is_deleted ON batches(is_deleted);

-- Certificates table
CREATE TABLE IF NOT EXISTS certificates (
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

CREATE INDEX IF NOT EXISTS idx_certificates_cert_hash ON certificates(cert_hash);
CREATE INDEX IF NOT EXISTS idx_certificates_qr_code ON certificates(qr_code);
CREATE INDEX IF NOT EXISTS idx_certificates_batch_id ON certificates(batch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_issued_by ON certificates(issued_by);

-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
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
    current_location VARCHAR(255),
    expected_delivery_date DATE,
    delivered_to_name VARCHAR(255),
    delivery_notes TEXT,
    temperature_log JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipments_batch_id ON shipments(batch_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_transporter_id ON shipments(transporter_id);

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    buyer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
    requested_quantity_kg DECIMAL(10, 2) NOT NULL,
    requested_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    delivery_location VARCHAR(255) NOT NULL,
    preferred_delivery_date DATE NOT NULL,
    delivery_contact_name VARCHAR(255),
    delivery_contact_phone VARCHAR(20),
    delivery_instructions TEXT,
    notes TEXT,
    status order_status DEFAULT 'REQUESTED',
    preferred_transporter_id INTEGER REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    fulfilled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_buyer_id ON purchase_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_batch_id ON purchase_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_buyer_batch_status
ON purchase_orders (buyer_id, batch_id, status);

-- Transporter Ratings table
CREATE TABLE IF NOT EXISTS transporter_ratings (
  id SERIAL PRIMARY KEY,
  transporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shipment_id INTEGER UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  order_id INTEGER UNIQUE REFERENCES purchase_orders(id) ON DELETE SET NULL,
  rated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  region VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transporter_ratings_transporter_id ON transporter_ratings(transporter_id);
CREATE INDEX IF NOT EXISTS idx_transporter_ratings_region ON transporter_ratings(region);

-- Add missing columns to existing tables idempotently
DO $$
BEGIN
    -- Shipments updates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shipments' AND column_name='order_id') THEN
        ALTER TABLE shipments ADD COLUMN order_id INTEGER UNIQUE REFERENCES purchase_orders(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shipments' AND column_name='current_location') THEN
        ALTER TABLE shipments ADD COLUMN current_location VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shipments' AND column_name='expected_delivery_date') THEN
        ALTER TABLE shipments ADD COLUMN expected_delivery_date DATE;
    END IF;
    
    -- Users updates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='region') THEN
        ALTER TABLE users ADD COLUMN region VARCHAR(100);
    END IF;
    
    -- Batches updates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='region') THEN
        ALTER TABLE batches ADD COLUMN region VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='batches' AND column_name='batch_unit') THEN
        ALTER TABLE batches ADD COLUMN batch_unit VARCHAR(20) NOT NULL DEFAULT 'kg';
    END IF;

    -- Purchase Orders updates
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='preferred_transporter_id') THEN
        ALTER TABLE purchase_orders ADD COLUMN preferred_transporter_id INTEGER REFERENCES users(id);
    END IF;

    -- 6. Performance & Data Integrity Indices
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipments_batch_id ON shipments(batch_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_certificates_qr_code ON certificates(qr_code)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_certificates_cert_hash ON certificates(cert_hash)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fraud_flags_severity ON fraud_flags(severity)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fraud_flags_batch_id ON fraud_flags(batch_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)';
END$$;

-- Add indices for new columns after they've been confirmed to exist
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region);
CREATE INDEX IF NOT EXISTS idx_batches_region ON batches(region);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_preferred_transporter_id ON purchase_orders(preferred_transporter_id);

-- Fraud Flags table
CREATE TABLE IF NOT EXISTS fraud_flags (
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

CREATE INDEX IF NOT EXISTS idx_fraud_flags_flag_type ON fraud_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_severity ON fraud_flags(severity);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON fraud_flags(status);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_batch_id ON fraud_flags(batch_id);

-- Fraud Cases table
CREATE TABLE IF NOT EXISTS fraud_cases (
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

CREATE INDEX IF NOT EXISTS idx_fraud_cases_flag_id ON fraud_cases(flag_id);
CREATE INDEX IF NOT EXISTS idx_fraud_cases_assigned_to ON fraud_cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fraud_cases_decision ON fraud_cases(decision);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at idempotently
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_batches_updated_at') THEN
        CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_shipments_updated_at') THEN
        CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_purchase_orders_updated_at') THEN
        CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_fraud_flags_updated_at') THEN
        CREATE TRIGGER update_fraud_flags_updated_at BEFORE UPDATE ON fraud_flags
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_fraud_cases_updated_at') THEN
        CREATE TRIGGER update_fraud_cases_updated_at BEFORE UPDATE ON fraud_cases
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_transporter_ratings_updated_at') THEN
        CREATE TRIGGER update_transporter_ratings_updated_at BEFORE UPDATE ON transporter_ratings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;

-- Create views for common queries
CREATE OR REPLACE VIEW active_fraud_flags AS
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

CREATE OR REPLACE VIEW fraud_statistics AS
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

async function migrate(skipPoolEnd = false) {
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
        if (!skipPoolEnd) {
            await pool.end();
        }
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
