const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixSubscriptionsAutoRenew() {
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
        const [columns] = await connection.query("SHOW COLUMNS FROM subscriptions LIKE 'auto_renew'");

        if (columns.length === 0) {
            console.log('🔧 Adding auto_renew column to subscriptions table...');
            await connection.query(`
        ALTER TABLE subscriptions
        ADD COLUMN auto_renew BOOLEAN DEFAULT FALSE AFTER status
      `);
            console.log('✅ Column auto_renew added successfully');
        } else {
            console.log('ℹ️  Column auto_renew already exists');
        }

        console.log('\n🎉 Subscriptions table fixed!');

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

fixSubscriptionsAutoRenew();
