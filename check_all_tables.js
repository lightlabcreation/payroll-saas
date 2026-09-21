const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'payroll_db'
};

async function checkAllTables() {
    try {
        const connection = await mysql.createConnection(config);

        const tables = [
            'job_seeker_profiles',
            'job_seeker_skills',
            'job_seeker_experience',
            'job_seeker_education'
        ];

        for (const table of tables) {
            console.log(`\n=== ${table} ===`);
            try {
                const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
                columns.forEach(col => console.log(`  ${col.Field}`));
            } catch (err) {
                console.log(`  Table does not exist: ${err.message}`);
            }
        }

        await connection.end();
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}
checkAllTables();
