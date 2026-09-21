
const db = require('../config/mysql');

async function debugTransactions() {
    try {
        const [columns] = await db.query('DESCRIBE transactions');
        console.log('--- TRANSACTIONS TABLE SCHEMA ---');
        console.log(JSON.stringify(columns.map(c => c.Field)));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugTransactions();
