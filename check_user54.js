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

        const [user] = await connection.query('SELECT * FROM users WHERE id = 54');
        if (user.length > 0) {
            console.log('User ID 54:');
            console.log(`  Email: ${user[0].email}`);
            console.log(`  Role: ${user[0].role}`);
            console.log(`  Name: ${user[0].name}`);
        } else {
            console.log('User ID 54 not found');
        }

        await connection.end();
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}
check();
