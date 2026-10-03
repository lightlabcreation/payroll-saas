const db = require('../config/mysql');

async function initWhatsAppTables() {
  try {
    console.log('Ensuring WhatsApp database tables exist...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        user_id INT NOT NULL,
        phone_number VARCHAR(30),
        status ENUM('DISCONNECTED', 'CONNECTING', 'QR_READY', 'AUTHENTICATING', 'CONNECTED', 'ERROR') DEFAULT 'DISCONNECTED',
        session_id VARCHAR(100) UNIQUE,
        connected_at DATETIME,
        last_seen_at DATETIME,
        last_error TEXT,
        auto_send_payslip BOOLEAN DEFAULT TRUE,
        auto_send_attendance BOOLEAN DEFAULT TRUE,
        auto_send_alerts BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id)
      ) ENGINE=InnoDB
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NULL,
        recipient_phone VARCHAR(30) NOT NULL,
        recipient_name VARCHAR(100),
        recipient_role VARCHAR(50),
        event_type VARCHAR(100),
        message_content TEXT,
        status ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED') DEFAULT 'QUEUED',
        error_message TEXT,
        provider_message_id VARCHAR(150),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_log_tenant (tenant_id)
      ) ENGINE=InnoDB
    `);

    console.log('✅ WhatsApp tables initialized successfully in pop_db');
  } catch (error) {
    console.error('❌ Error initializing WhatsApp tables:', error);
  }
}

if (require.main === module) {
  initWhatsAppTables().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = initWhatsAppTables;
