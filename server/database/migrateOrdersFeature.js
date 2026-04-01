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
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_buyer_id ON purchase_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_batch_id ON purchase_orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_active_buyer_batch
ON purchase_orders (buyer_id, batch_id)
WHERE status IN ('REQUESTED', 'APPROVED');

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
