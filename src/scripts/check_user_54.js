const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        const [users] = await connection.query('SELECT id, name, email, role FROM users WHERE id = 54');
        console.log('User 54:', JSON.stringify(users, null, 2));

        const [jobseekers] = await connection.query('SELECT * FROM job_seekers WHERE user_id = 54 OR id = 54');
        console.log('Job Seekers matching 54:', JSON.stringify(jobseekers, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (connection) await connection.end();
    }
})();
