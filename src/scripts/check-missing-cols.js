
const db = require('../config/mysql');

async function checkSpecificColumns() {
    const checks = [
        { table: 'salary_records', column: 'payment_date' },
        { table: 'bank_details', column: 'employee_id' },
        { table: 'jobs', column: 'salary_min' },
        { table: 'bills', column: 'employee_id' }
    ];

    for (const check of checks) {
        try {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${check.table} LIKE '${check.column}'`);
            console.log(`${check.table}.${check.column}: ${rows.length > 0 ? 'EXISTS' : 'MISSING'}`);
        } catch (err) {
            console.log(`${check.table}.${check.column}: ERROR (${err.message})`);
        }
    }
    process.exit();
}

checkSpecificColumns();
