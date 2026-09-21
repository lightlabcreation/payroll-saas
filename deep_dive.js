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

        const empId = 2;
        console.log(`--- Checking for Employee ID: ${empId} ---`);

        const [emp] = await pool.query("SELECT * FROM employees WHERE id = ?", [empId]);
        console.log('Employee:', emp);

        const [sal] = await pool.query("SELECT * FROM salary_records WHERE employee_id = ?", [empId]);
        console.log('Salary Records:', sal);

        const [bills] = await pool.query("SELECT * FROM bills WHERE employee_id = ?", [empId]);
        console.log('Bills:', bills);

        const [bank] = await pool.query("SELECT * FROM bank_details WHERE employee_id = ?", [empId]);
        console.log('Bank Details:', bank);

        const [txns] = await pool.query("SELECT * FROM transactions WHERE user_id = ?", [emp[0].user_id]);
        console.log('Transactions:', txns);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
