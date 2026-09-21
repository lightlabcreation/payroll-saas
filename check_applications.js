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

        // Check job applications
        const [apps] = await connection.query('SELECT * FROM job_applications ORDER BY created_at DESC LIMIT 5');
        console.log('Recent job applications:');
        apps.forEach(app => {
            console.log(`  ID: ${app.id}, jobseeker_id: ${app.jobseeker_id}, job_id: ${app.job_id}, status: ${app.status}`);
        });

        // Check users with employee role
        const [users] = await connection.query("SELECT id, email, role FROM users WHERE role = 'employee' LIMIT 3");
        console.log('\nEmployees:');
        users.forEach(u => console.log(`  ID: ${u.id}, email: ${u.email}`));

        await connection.end();
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}
check();
