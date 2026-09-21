const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDB() {
    let connection;
    try {
        console.log('Connecting to DB...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db',
            port: parseInt(process.env.DB_PORT, 10) || 3306
        });

        const [tables] = await connection.query('SHOW TABLES');
        console.log('Tables:', tables.map(t => Object.values(t)[0]));

        const tablesToCheck = ['users', 'user_requests', 'companies', 'employers', 'vendors'];
        for (const table of tablesToCheck) {
            try {
                const [columns] = await connection.query(`DESCRIBE ${table}`);
                console.log(`\nTable: ${table}`);
                console.table(columns.map(c => ({ Field: c.Field, Type: c.Type })));
            } catch (err) {
                console.log(`\nTable ${table} does not exist or error:`, err.message);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (connection) await connection.end();
    }
}

checkDB();
