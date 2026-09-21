const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'payroll_db'
};

async function check() {
    try {
        const connection = await mysql.createConnection(config);
        const [columns] = await connection.query('SHOW COLUMNS FROM job_applications');
        console.log('job_applications table columns:');
        columns.forEach(col => console.log(`  - ${col.Field} (${col.Type})`));
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
