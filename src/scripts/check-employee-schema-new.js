
const db = require('../config/mysql');

async function checkSchema() {
    const tables = ['salary_records', 'bank_details', 'jobs', 'bills', 'attendance', 'job_applications', 'employees'];
    for (const table of tables) {
        console.log(`\n--- Schema for ${table} ---`);
        try {
            const [rows] = await db.query(`DESCRIBE ${table}`);
            rows.forEach(row => {
                console.log(`${row.Field} | ${row.Type} | ${row.Null} | ${row.Key} | ${row.Default} | ${row.Extra}`);
            });
        } catch (err) {
            console.log(`Error describing ${table}: ${err.message}`);
        }
    }
    process.exit();
}

checkSchema();
