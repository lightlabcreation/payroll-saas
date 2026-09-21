const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixCompaniesColumn() {
    let connection;

    try {
        console.log('🔌 Connecting to database...');

        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log('✅ Connected');

        // Check if column exists
        const [columns] = await connection.query("SHOW COLUMNS FROM companies LIKE 'subscription_plan'");

        if (columns.length === 0) {
            console.log('🔧 Adding subscription_plan column to companies table...');
            await connection.query(`
        ALTER TABLE companies
        ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'basic' AFTER Pan_number
      `);
            console.log('✅ Column added successfully');
        } else {
            console.log('ℹ️  Column subscription_plan already exists');
        }

        // Also check if status column exists as implied by other queries
        const [statusCol] = await connection.query("SHOW COLUMNS FROM companies LIKE 'status'");
        if (statusCol.length === 0) {
            console.log('🔧 Adding status column to companies table...');
            await connection.query(`
        ALTER TABLE companies
        ADD COLUMN status VARCHAR(20) DEFAULT 'active'
      `);
            console.log('✅ Status column added');
        }

        console.log('\n🎉 Companies table structure fixed!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Connection closed');
        }
    }
}

fixCompaniesColumn();
