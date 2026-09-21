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

        const tables = ['employees', 'vendors', 'users', 'employers'];
        for (const t of tables) {
            const [rows] = await connection.query(`DESCRIBE ${t}`);
            console.log(`Table ${t}:`, rows.map(r => r.Field).join(', '));
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (connection) await connection.end();
    }
})();
