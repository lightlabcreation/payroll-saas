const mysql = require('mysql2/promise');
const env = require('./src/config/env');

async function run() {
    try {
        const pool = mysql.createPool({
            host: env.db.host,
            user: env.db.user,
            password: env.db.password,
            database: env.db.name
        });

        const empId = 2; // sample employee
        const [bank] = await pool.query("SELECT * FROM bank_details WHERE employee_id = ?", [empId]);
        console.log('Bank Details:', bank);
        const [bills] = await pool.query("SELECT * FROM bills WHERE employee_id = ?", [empId]);
        console.log('Bills:', bills);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
