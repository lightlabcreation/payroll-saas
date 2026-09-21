
const db = require('../config/mysql');

async function debugSchema() {
    const tables = ['salary_records', 'bank_details', 'jobs', 'bills', 'attendance'];
    for (const table of tables) {
        try {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table}`);
            console.log(`\n${table} columns:`, rows.map(r => r.Field).join(', '));
        } catch (err) {
            console.log(`\n${table} error:`, err.message);
        }
    }
    process.exit();
}

debugSchema();
