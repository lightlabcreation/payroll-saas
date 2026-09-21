
const db = require('../config/mysql');

async function checkPaymentTable() {
    try {
        const [columns] = await db.query(`DESCRIBE payments`);
        console.log('Columns in payments table:');
        columns.forEach(col => console.log(col.Field));
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        process.exit();
    }
}

checkPaymentTable();
