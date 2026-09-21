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

        // Check if job_seekers table exists
        const [tables] = await connection.query("SHOW TABLES LIKE 'job_seekers'");
        if (tables.length > 0) {
            console.log('job_seekers table exists');
            const [columns] = await connection.query('SHOW COLUMNS FROM job_seekers');
            console.log('Columns:');
            columns.forEach(col => console.log(`  - ${col.Field} (${col.Type})`));
        } else {
            console.log('job_seekers table does NOT exist');
        }

        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
