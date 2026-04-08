const pool = require('./database/db');

async function addDelayedEnum() {
  try {
    await pool.query("ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'DELAYED'");
    console.log("Successfully added DELAYED to shipment_status ENUM if it wasn't there.");
  } catch (err) {
    if (err.code === '42710') {
      console.log("DELAYED enum value already exists.");
    } else {
      console.log("Error or Enum not ready:", err.message);
    }
  } finally {
    pool.end();
  }
}

addDelayedEnum();
