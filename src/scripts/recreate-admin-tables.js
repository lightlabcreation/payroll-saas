const mysql = require('mysql2/promise');
require('dotenv').config();

async function recreateCorruptTables() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log('🔌 Dropping and Recreating missing/corrupt tables...');

        // Drop
        await connection.query('DROP TABLE IF EXISTS employers');
        await connection.query('DROP TABLE IF EXISTS employees');
        await connection.query('DROP TABLE IF EXISTS vendors');

        // Create using MyISAM
        await connection.query(`
      CREATE TABLE employers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        company_id INT,
        designation VARCHAR(100) DEFAULT 'Manager',
        status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
        created_by INT,
        company_name VARCHAR(100),
        company_address TEXT,
        gst_number VARCHAR(50),
        pan_number VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_company (company_id)
      ) ENGINE=MyISAM
    `);
        console.log('✅ Recreated employers table');

        await connection.query(`
      CREATE TABLE employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        company_id INT NOT NULL,
        designation VARCHAR(100),
        salary DECIMAL(10, 2),
        department VARCHAR(100),
        joining_date DATE,
        status ENUM('active', 'inactive', 'terminated') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_company (company_id)
      ) ENGINE=MyISAM
    `);
        console.log('✅ Recreated employees table');

        await connection.query(`
      CREATE TABLE vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        company_id INT, 
        company_name VARCHAR(100),
        contact_person VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        service_type VARCHAR(100),
        payment_status ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_company (company_id)
      ) ENGINE=MyISAM
    `);
        console.log('✅ Recreated vendors table');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) connection.end();
    }
}

recreateCorruptTables();
