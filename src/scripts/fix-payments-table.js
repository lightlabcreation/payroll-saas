
const db = require('../config/mysql');

async function fixPaymentsTable() {
    try {
        const connection = await db.getConnection();
        console.log('Adding missing columns to payments table...');

        try {
            // Check if invoice_id exists
            const [cols] = await connection.query("SHOW COLUMNS FROM payments LIKE 'invoice_id'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE payments ADD COLUMN invoice_id INT DEFAULT NULL AFTER id");
                console.log('Added invoice_id column');
            }

            // Check payment_method
            const [cols2] = await connection.query("SHOW COLUMNS FROM payments LIKE 'payment_method'");
            if (cols2.length === 0) {
                await connection.query("ALTER TABLE payments ADD COLUMN payment_method VARCHAR(50) DEFAULT NULL AFTER amount");
                console.log('Added payment_method column');
            }

            // Check payment_reference
            const [cols3] = await connection.query("SHOW COLUMNS FROM payments LIKE 'payment_reference'");
            if (cols3.length === 0) {
                await connection.query("ALTER TABLE payments ADD COLUMN payment_reference VARCHAR(100) DEFAULT NULL AFTER payment_method");
                console.log('Added payment_reference column');
            }

            // Check transaction_id
            const [cols4] = await connection.query("SHOW COLUMNS FROM payments LIKE 'transaction_id'");
            if (cols4.length === 0) {
                await connection.query("ALTER TABLE payments ADD COLUMN transaction_id VARCHAR(100) DEFAULT NULL AFTER payment_reference");
                console.log('Added transaction_id column');
            }

            // Check notes
            const [cols5] = await connection.query("SHOW COLUMNS FROM payments LIKE 'notes'");
            if (cols5.length === 0) {
                await connection.query("ALTER TABLE payments ADD COLUMN notes TEXT DEFAULT NULL");
                console.log('Added notes column');
            }

        } catch (err) {
            console.error('Error altering table:', err);
        } finally {
            connection.release();
        }

        console.log('Payments table update completed.');

    } catch (error) {
        console.error('Script error:', error);
    } finally {
        process.exit();
    }
}

fixPaymentsTable();
