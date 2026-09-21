
const db = require('../config/mysql');
const fs = require('fs');

async function debugSchema() {
    const tables = ['salary_records', 'bank_details', 'jobs', 'bills', 'attendance', 'employees'];
    let output = '';
    for (const table of tables) {
        try {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table}`);
            output += `\n--- ${table} ---\n`;
            rows.forEach(r => {
                output += `${r.Field} (${r.Type})\n`;
            });
        } catch (err) {
            output += `\n--- ${table} ---\nError: ${err.message}\n`;
        }
    }
    fs.writeFileSync('schema_report.txt', output);
    process.exit();
}

debugSchema();
