const db = require('../config/mysql');

async function createTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ password_reset_tokens table created successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating password_reset_tokens table:', err.message);
    process.exit(1);
  }
}

createTable();
