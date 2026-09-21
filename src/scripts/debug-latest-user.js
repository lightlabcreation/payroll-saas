const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLatestUser() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        // Get latest user
        const [users] = await connection.query(`
      SELECT * FROM users ORDER BY created_at DESC LIMIT 1
    `);

        if (users.length === 0) {
            console.log('No users found');
            return;
        }

        const user = users[0];
        console.log('\n👤 Latest User:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.status}`);
        console.log(`   Company ID: ${user.company_id}`);

        // Check company linking
        if (user.company_id) {
            const [companies] = await connection.query('SELECT * FROM companies WHERE id = ?', [user.company_id]);
            if (companies.length > 0) {
                console.log('\n🏢 Company Found (via user.company_id):');
                console.log(companies[0]);
            } else {
                console.log('\n❌ Company record NOT found for ID:', user.company_id);
            }
        }

        // Check valid linking via user_id
        const [companiesByUser] = await connection.query('SELECT * FROM companies WHERE user_id = ?', [user.id]);
        if (companiesByUser.length > 0) {
            console.log('\n🏢 Company Found (via user_id):');
            console.log(companiesByUser[0]);
        } else {
            console.log('\n❌ No company found with user_id:', user.id);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) connection.end();
    }
}

checkLatestUser();
