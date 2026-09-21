const mysql = require('mysql2/promise');
require('dotenv').config();

async function upgradeUserToAdmin() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        const email = 'admin@gmail.com';
        console.log(`🔌 Upgrading user ${email} to ADMIN role...`);

        // 1. Get User
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            console.log('❌ User not found');
            return;
        }
        const user = users[0];
        console.log(`✅ Found user ID: ${user.id} (Current Role: ${user.role})`);

        // 2. Update Role to 'admin'
        await connection.query("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
        console.log("✅ Updated users table: role = 'admin'");

        // 3. Create Admin Record (if not exists)
        const [existingAdmins] = await connection.query('SELECT * FROM admins WHERE user_id = ?', [user.id]);
        let adminId;

        if (existingAdmins.length === 0) {
            const [adminRes] = await connection.query(
                "INSERT INTO admins (user_id, created_at, updated_at) VALUES (?, NOW(), NOW())",
                [user.id]
            );
            adminId = adminRes.insertId;
            console.log(`✅ Created admins record: ID ${adminId}`);
        } else {
            adminId = existingAdmins[0].id;
            console.log(`ℹ️  Admin record already exists: ID ${adminId}`);
        }

        // 4. Update Company to link to this Admin ID
        if (user.company_id) {
            await connection.query("UPDATE companies SET admin_id = ? WHERE id = ?", [adminId, user.company_id]);
            console.log(`✅ Linked Company ${user.company_id} to AdminID ${adminId}`);
        } else {
            // Try finding company by user_id
            const [companies] = await connection.query("SELECT * FROM companies WHERE user_id = ?", [user.id]);
            if (companies.length > 0) {
                await connection.query("UPDATE companies SET admin_id = ? WHERE id = ?", [adminId, companies[0].id]);
                console.log(`✅ Found & Linked Company ${companies[0].id} to AdminID ${adminId}`);
            }
        }

        console.log("\n🎉 User successfully upgraded to ADMIN!");
        console.log("👉 Please perform a hard refresh and login again.");

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) connection.end();
    }
}

upgradeUserToAdmin();
