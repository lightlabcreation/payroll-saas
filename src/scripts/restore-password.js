const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function restoreOriginalPassword() {
    let connection;

    try {
        console.log('🔌 Connecting to database...');

        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log('✅ Connected');

        // Update superadmin password back to 123
        const password = '123';
        const hashedPassword = await bcrypt.hash(password, 10);

        await connection.query(
            'UPDATE users SET password = ? WHERE email = ? AND role = ?',
            [hashedPassword, 'superadmin@gmail.com', 'superadmin']
        );

        console.log('✅ Superadmin password restored to original');
        console.log('\n🎉 Superadmin credentials:');
        console.log('   📧 Email: superadmin@gmail.com');
        console.log('   🔑 Password: 123');

        // Verify the password
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', ['superadmin@gmail.com']);
        const isValid = await bcrypt.compare('123', users[0].password);
        console.log('\n✅ Password verification:', isValid ? 'SUCCESS ✓' : 'FAILED ✗');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Connection closed');
        }
    }
}

restoreOriginalPassword();
