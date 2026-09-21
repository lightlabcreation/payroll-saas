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
        const [rows] = await connection.query('SELECT * FROM attendance LIMIT 1');
        console.log('Columns:', Object.keys(rows[0] || {}));
        console.log('Data:', rows[0]);
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
check();
