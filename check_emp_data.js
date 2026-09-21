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

        const [rows] = await pool.query("SELECT u.id as user_id, u.name, e.id as employee_id FROM users u JOIN employees e ON u.id = e.user_id WHERE u.role = 'employee' LIMIT 1");
        console.log('Sample Employee:', rows[0]);

        if (rows[0]) {
            const empId = rows[0].employee_id;
            const [sal] = await pool.query("SELECT * FROM salary_records WHERE employee_id = ?", [empId]);
            console.log('Salary Records:', sal.length);
            const [bills] = await pool.query("SELECT * FROM bills WHERE employee_id = ?", [empId]);
            console.log('Bills:', bills.length);
            const [bank] = await pool.query("SELECT * FROM bank_details WHERE employee_id = ?", [empId]);
            console.log('Bank Details:', bank.length);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
