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

        const [users] = await connection.query('SELECT id, name, email, role FROM users WHERE name LIKE "%job%" OR email LIKE "%job%"');
        console.log('Users matching "job":', JSON.stringify(users, null, 2));

        const [jobseekersAll] = await connection.query('SELECT * FROM job_seekers');
        console.log('All Job Seekers:', JSON.stringify(jobseekersAll, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (connection) await connection.end();
    }
})();
