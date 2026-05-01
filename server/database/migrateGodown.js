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

    // 1. Add godown to user_role enum (outside transaction)
    try {
      await client.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'godown'`);
      console.log("✅ 'godown' added to user_role enum");
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️  Enum warning:', err.message);
      }
    }

    // 2. Start transaction
    await client.query('BEGIN');

    // 3. Add godown columns to farmer_yields
    await client.query(`ALTER TABLE farmer_yields ADD COLUMN IF NOT EXISTS godown_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    console.log('✅ godown_id column added to farmer_yields');

    await client.query(`ALTER TABLE farmer_yields ADD COLUMN IF NOT EXISTS godown_name VARCHAR(255)`);
    console.log('✅ godown_name column added to farmer_yields');

    // 4. Add godown columns to users (inspector belongs to a godown)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS godown_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    console.log('✅ godown_id column added to users');

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS godown_name VARCHAR(255)`);
    console.log('✅ godown_name column added to users');

    // 5. Create godowns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS godowns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        location VARCHAR(255),
        region VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ godowns table created');

    // 6. Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_farmer_yields_godown_id ON farmer_yields(godown_id)`);
    console.log('✅ Index created on farmer_yields.godown_id');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_godown_id ON users(godown_id)`);
    console.log('✅ Index created on users.godown_id');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_godowns_owner_id ON godowns(owner_id)`);
    console.log('✅ Index created on godowns.owner_id');

    // 7. Commit transaction
    await client.query('COMMIT');
    console.log('');
    console.log('✅ Godown migration completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('   - Added godown role to user_role enum');
    console.log('   - Added godown_id + godown_name to farmer_yields');
    console.log('   - Added godown_id + godown_name to users');
    console.log('   - Created godowns table');
    console.log('   - Created indexes for performance');
    console.log('');
    console.log('🎉 Your system is now ready for godown functionality!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Godown migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Export for use in endpoints or other scripts
module.exports = migrateGodown;

// Run if called directly from command line
if (require.main === module) {
  migrateGodown()
    .then(() => {
      console.log('Migration complete. Exiting...');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
