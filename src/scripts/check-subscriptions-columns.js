
const db = require('../config/mysql');

async function checkSubscriptionsTable() {
    try {
        const [columns] = await db.query(`DESCRIBE subscriptions`);
        console.log('Columns in subscriptions table:');
        columns.forEach(col => console.log(col.Field));
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        process.exit();
    }
}

checkSubscriptionsTable();
