const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs');

(async () => {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        const tables = ['job_seekers', 'job_seeker_profiles', 'job_seeker_skills', 'job_seeker_experience', 'job_seeker_education', 'job_applications'];
        const results = {};
        for (const table of tables) {
            try {
                const [rows] = await connection.query('DESCRIBE ' + table);
                results[table] = rows;
            } catch (e) {
                results[table] = { error: e.message };
            }
        }
        fs.writeFileSync('schema_debug.json', JSON.stringify(results, null, 2));
        console.log('Schema written to schema_debug.json');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (connection) await connection.end();
    }
})();
