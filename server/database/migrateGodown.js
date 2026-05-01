// server/database/migrateGodown.js
// Run once: node server/database/migrateGodown.js
const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
  : { host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD };

const pool = new Pool(poolConfig);

async function migrateGodown() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting godown migration...');

    // 1. Add 'godown' to user_role enum (must be outside transaction)
    try {
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'godown'`);
      console.log("✅ 'godown' added to user_role enum");
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️  Enum warning:', err.message);
      }
    }

    await client.query('BEGIN');

    // 2. Add godown_id column to farmer_yields (links yield to a godown user)
    await client.query(`
      ALTER TABLE farmer_yields
        ADD COLUMN IF NOT EXISTS godown_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log('✅ godown_id column added to farmer_yields');

    // 3. Add godown_name to farmer_yields (name of the godown/warehouse)
    await client.query(`
      ALTER TABLE farmer_yields
        ADD COLUMN IF NOT EXISTS godown_name VARCHAR(255)
    `);
    console.log('✅ godown_name column added to farmer_yields');

    // 4. Index for fast lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_farmer_yields_godown_id ON farmer_yields(godown_id)
    `);

    await client.query('COMMIT');
    console.log('✅ Godown migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Godown migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateGodown();
