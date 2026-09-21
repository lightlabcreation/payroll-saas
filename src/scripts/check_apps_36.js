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

        const [apps] = await connection.query('SELECT * FROM job_applications WHERE jobseeker_id = 36');
        console.log('Applications for User 36:', JSON.stringify(apps, null, 2));

        const [appsByJSId] = await connection.query('SELECT * FROM job_applications WHERE jobseeker_id = 1');
        console.log('Applications for Job Seeker ID 1:', JSON.stringify(appsByJSId, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (connection) await connection.end();
    }
})();
