
const db = require('../config/mysql');

async function checkInvoicesTable() {
    try {
        const [columns] = await db.query(`DESCRIBE invoices`);
        console.log('Columns in invoices table:');
        columns.forEach(col => console.log(col.Field));
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        process.exit();
    }
}

checkInvoicesTable();
