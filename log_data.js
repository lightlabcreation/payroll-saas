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

        const [rows] = await pool.query("SELECT * FROM employees");
        console.log('Employees:', rows);

        const [stats] = await pool.query("SELECT * FROM salary_records");
        console.log('Salary Records:', stats);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
