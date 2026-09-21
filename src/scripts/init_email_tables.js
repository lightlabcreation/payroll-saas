const db = require('../config/mysql');

async function initEmailTables() {
  console.log('🔄 Initializing Email & Notification Tables...');
  const connection = await db.getConnection();

  try {
    // 1. Email Logs Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_type VARCHAR(100) NOT NULL,
        recipient_email VARCHAR(150) NOT NULL,
        sender_email VARCHAR(150) NOT NULL,
        company_id INT NULL,
        user_id INT NULL,
        ticket_id VARCHAR(100) NULL,
        subscription_id INT NULL,
        transaction_id VARCHAR(150) NULL,
        subject VARCHAR(255) NOT NULL,
        status ENUM('pending', 'accepted', 'failed') NOT NULL DEFAULT 'pending',
        message_id VARCHAR(150) NULL,
        delivery_attempts INT DEFAULT 1,
        error_message TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_type (notification_type),
        INDEX idx_recipient (recipient_email),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ email_logs table verified');

    // 2. Subscription Reminders Table (Idempotency for 7d, 3d, 1d, expired alerts)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subscription_reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subscription_id INT NOT NULL,
        employer_id INT NOT NULL,
        reminder_type ENUM('7_day', '3_day', '1_day', 'expired') NOT NULL,
        sent_to_email VARCHAR(150) NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_sub_reminder (subscription_id, reminder_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ subscription_reminders table verified');

    // 3. Support Tickets Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_number VARCHAR(50) NOT NULL UNIQUE,
        company_id INT NULL,
        company_name VARCHAR(200) NOT NULL,
        user_id INT NULL,
        contact_name VARCHAR(100) NOT NULL,
        contact_email VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        priority ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal',
        status ENUM('Open', 'In Progress', 'Resolved', 'Closed') DEFAULT 'Open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ticket_num (ticket_number),
        INDEX idx_status (status),
        INDEX idx_contact_email (contact_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ support_tickets table verified');

    // 4. Support Ticket Messages Table (Supports internal staff notes)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        sender_id INT NULL,
        sender_name VARCHAR(100) NOT NULL,
        role ENUM('customer', 'staff') NOT NULL,
        message TEXT NOT NULL,
        attachment_url VARCHAR(255) NULL,
        is_internal BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_msg_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ support_ticket_messages table verified');

    // 5. Account Activation / Password Setup Tokens Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_setup_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(150) NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ password_setup_tokens table verified');

    console.log('🎉 All Email & Notification System tables successfully initialized!');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

initEmailTables();
