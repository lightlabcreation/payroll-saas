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

        // Check job_seekers table
        const [jobseekers] = await connection.query('SELECT * FROM job_seekers LIMIT 5');
        console.log('job_seekers table data:');
        jobseekers.forEach(js => console.log(`  ID: ${js.id}, user_id: ${js.user_id}, email: ${js.email}`));

        // Check users with jobseeker role
        const [users] = await connection.query("SELECT id, email, role FROM users WHERE role = 'jobseeker' LIMIT 5");
        console.log('\nUsers with jobseeker role:');
        users.forEach(u => console.log(`  ID: ${u.id}, email: ${u.email}, role: ${u.role}`));

        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
