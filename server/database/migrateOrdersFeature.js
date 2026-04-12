const pool = require('./db');
require('dotenv').config();

const migrationSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  buyer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
  requested_quantity_kg DECIMAL(10, 2) NOT NULL,
  requested_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
  notes TEXT,
  status order_status DEFAULT 'REQUESTED',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  fulfilled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS delivery_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
  ADD COLUMN IF NOT EXISTS requested_unit VARCHAR(20) DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_unit VARCHAR(20) DEFAULT 'kg';

UPDATE batches
SET batch_unit = COALESCE(NULLIF(TRIM(batch_unit), ''), 'kg')
WHERE batch_unit IS NULL OR TRIM(batch_unit) = '';

ALTER TABLE batches
  ALTER COLUMN batch_unit SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_buyer_id ON purchase_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_batch_id ON purchase_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

UPDATE purchase_orders
SET delivery_location = COALESCE(delivery_location, 'Pending delivery location'),
    preferred_delivery_date = COALESCE(preferred_delivery_date, CURRENT_DATE + INTERVAL '7 day')::date
WHERE delivery_location IS NULL OR preferred_delivery_date IS NULL;

ALTER TABLE purchase_orders
  ALTER COLUMN requested_unit SET DEFAULT 'kg';

UPDATE purchase_orders
SET requested_unit = COALESCE(NULLIF(TRIM(requested_unit), ''), 'kg')
WHERE requested_unit IS NULL OR TRIM(requested_unit) = '';

ALTER TABLE purchase_orders
  ALTER COLUMN delivery_location SET NOT NULL,
  ALTER COLUMN requested_unit SET NOT NULL,
  ALTER COLUMN preferred_delivery_date SET NOT NULL;

DROP INDEX IF EXISTS uq_purchase_orders_active_buyer_batch;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_buyer_batch_status
ON purchase_orders (buyer_id, batch_id, status);

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS order_id INTEGER UNIQUE REFERENCES purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivered_to_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'purchase_orders'
  ) AND EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_purchase_orders_updated_at'
  ) THEN
    CREATE TRIGGER update_purchase_orders_updated_at
      BEFORE UPDATE ON purchase_orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;
`;

async function migrateOrdersFeature() {
  const client = await pool.connect();

  try {
    console.log('Running orders feature migration...');
    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');
    console.log('Orders feature migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Orders feature migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrateOrdersFeature();
}

module.exports = migrateOrdersFeature;
