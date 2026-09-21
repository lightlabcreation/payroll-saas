const mysql = require('mysql2/promise');
require('dotenv').config();

async function rebuildCreditsTable() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log('🔌 Rebuilding credits table...');

        // Drop existing table
        await connection.query('DROP TABLE IF EXISTS credits');
        console.log('🗑️  Dropped old credits table');

        // Create new table
        await connection.query(`
       CREATE TABLE credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employer_id INT NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 0.00,
        total_added DECIMAL(10, 2) DEFAULT 0.00,
        total_used DECIMAL(10, 2) DEFAULT 0.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=MyISAM
    `);
        console.log('✅ Created fresh credits table');

        // Verify
        const [cols] = await connection.query('DESCRIBE credits');
        console.log('\n📋 Table Structure:');
        cols.forEach(c => console.log(`   - ${c.Field} (${c.Type})`));

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) connection.end();
    }
}

rebuildCreditsTable();
