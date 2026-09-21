
const db = require('../config/mysql');

async function checkCreditsSchema() {
    try {
        const [columns] = await db.query('DESCRIBE credits');
        console.log('--- CREDITS TABLE SCHEMA ---');
        columns.forEach(col => console.log(`${col.Field} (${col.Type})`));

        const [rows] = await db.query('SELECT * FROM credits LIMIT 5');
        console.log('--- CREDITS DATA SAMPLE ---');
        console.log(JSON.stringify(rows, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkCreditsSchema();
