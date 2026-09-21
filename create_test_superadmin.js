const pool = require('./src/config/mysql');
const bcrypt = require('bcrypt');

const createSuperAdmin = async () => {
    try {
        const email = 'superadmin@example.com';
        const password = 'password123';
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if exists
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            console.log('Superadmin already exists. Updating password...');
            await pool.query('UPDATE users SET password = ?, role = "superadmin" WHERE email = ?', [hashedPassword, email]);

            // Ensure admin entry exists
            const [admin] = await pool.query('SELECT * FROM admins WHERE user_id = ?', [existing[0].id]);
            if (admin.length === 0) {
                await pool.query('INSERT INTO admins (user_id) VALUES (?)', [existing[0].id]);
            }
        } else {
            console.log('Creating new superadmin...');
            const [res] = await pool.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Super Admin', email, hashedPassword, 'superadmin']);
            await pool.query('INSERT INTO admins (user_id) VALUES (?)', [res.insertId]);
        }

        console.log('Superadmin ready: superadmin@example.com / password123');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

createSuperAdmin();
