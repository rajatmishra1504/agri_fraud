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
    console.log('Starting godown migration...');

    // Add godown to user_role enum (outside transaction)
    try {
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'godown'`);
      console.log("godown added to user_role enum");
    } catch (err) {
      if (!err.message.includes('already exists')) console.warn('Enum warning:', err.message);
    }

    await client.query('BEGIN');

    // godown_id + godown_name on farmer_yields
    await client.query(`ALTER TABLE farmer_yields ADD COLUMN IF NOT EXISTS godown_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE farmer_yields ADD COLUMN IF NOT EXISTS godown_name VARCHAR(255)`);

    // godown_id + godown_name on users (inspector belongs to a godown)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS godown_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS godown_name VARCHAR(255)`);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_farmer_yields_godown_id ON farmer_yields(godown_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_godown_id ON users(godown_id)`);

    await client.query('COMMIT');
    console.log('Godown migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Godown migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateGodown();
