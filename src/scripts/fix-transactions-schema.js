
const db = require('../config/mysql');

async function fixTransactionsSchema() {
    try {
        console.log('Adding payment_method column to transactions table...');

        // Add payment_method column if it doesn't exist
        try {
            await db.query(`ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(50) DEFAULT 'Bank'`);
            console.log('Added payment_method column.');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('Column payment_method already exists.');
            } else {
                throw error;
            }
        }

        // Also ensure transaction_id exists
        try {
            await db.query(`ALTER TABLE transactions ADD COLUMN transaction_id VARCHAR(100) DEFAULT NULL`);
            console.log('Added transaction_id column.');
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log('Column transaction_id already exists.');
            } else {
                throw error;
            }
        }

        console.log('Schema update complete.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

fixTransactionsSchema();
