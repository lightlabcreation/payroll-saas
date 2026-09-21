
const db = require('../config/mysql');

async function fixInvoicesTable() {
    try {
        const connection = await db.getConnection();
        console.log('Adding missing columns to invoices table...');

        try {
            // Check plan_id
            const [cols] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'plan_id'");
            if (cols.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN plan_id INT DEFAULT NULL AFTER invoice_number");
                console.log('Added plan_id column');
            }

            // Check subscription_id
            const [cols2] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'subscription_id'");
            if (cols2.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN subscription_id INT DEFAULT NULL AFTER employer_id");
                console.log('Added subscription_id column');
            }

            // Check tax_amount
            const [cols3] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'tax_amount'");
            if (cols3.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0.00 AFTER amount");
                console.log('Added tax_amount column');
            }

            // Check total_amount
            const [cols4] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'total_amount'");
            if (cols4.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00 AFTER tax_amount");
                console.log('Added total_amount column');
            }

            // Check due_date
            const [cols5] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'due_date'");
            if (cols5.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN due_date DATE DEFAULT NULL");
                console.log('Added due_date column');
            }

            // Check paid_date
            const [cols6] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'paid_date'");
            if (cols6.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN paid_date DATETIME DEFAULT NULL");
                console.log('Added paid_date column');
            }

            // Check notes
            const [cols7] = await connection.query("SHOW COLUMNS FROM invoices LIKE 'notes'");
            if (cols7.length === 0) {
                await connection.query("ALTER TABLE invoices ADD COLUMN notes TEXT DEFAULT NULL");
                console.log('Added notes column');
            }

        } catch (err) {
            console.error('Error altering table:', err);
        } finally {
            connection.release();
        }

        console.log('Invoices table update completed.');

    } catch (error) {
        console.error('Script error:', error);
    } finally {
        process.exit();
    }
}

fixInvoicesTable();
