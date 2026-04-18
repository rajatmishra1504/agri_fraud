const pool = require('./db');
const migrateBase = require('./migrate');
const migrateOrdersFeature = require('./migrateOrdersFeature');

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function bootstrap() {
  const client = await pool.connect();

  try {
    const hasUsersTable = await tableExists(client, 'users');

    if (!hasUsersTable) {
      console.log('Base schema not found. Creating fresh database schema...');
      await client.release();
      await migrateBase(true);
    } else {
      client.release();
    }

    await migrateOrdersFeature();
    console.log('Database bootstrap completed successfully.');
  } catch (error) {
    console.error('Database bootstrap failed:', error);
    throw error;
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = bootstrap;