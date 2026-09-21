require('dotenv').config();
const db = require('../config/mysql');
const bcrypt = require('bcrypt');

async function checkAdminCredentials() {
  console.log('=== CHECKING ADMIN & SUPERADMIN CREDENTIALS IN DATABASE ===\n');
  try {
    const [users] = await db.query(
      `SELECT id, name, email, role, status, created_at FROM users WHERE role IN ('superadmin', 'admin', 'employer') OR email LIKE '%admin%'`
    );

    console.log('Users in DB:');
    console.table(users);

    // Let's ensure default SuperAdmin account exists with known password
    const [superAdmins] = await db.query(`SELECT * FROM users WHERE role = 'superadmin' OR email = 'superadmin@gmail.com'`);
    if (superAdmins.length === 0) {
      const pass = 'Admin@123';
      const hash = await bcrypt.hash(pass, 10);
      await db.query(
        `INSERT INTO users (name, email, phone, password, role, status, created_at, updated_at)
         VALUES ('Super Admin', 'superadmin@gmail.com', '9999999999', ?, 'superadmin', 'active', NOW(), NOW())`,
        [hash]
      );
      console.log('\n✅ Created default SuperAdmin account: superadmin@gmail.com / Admin@123');
    } else {
      // Reset SuperAdmin password to Admin@123 for guaranteed login
      const pass = 'Admin@123';
      const hash = await bcrypt.hash(pass, 10);
      await db.query(
        `UPDATE users SET password = ?, status = 'active' WHERE id = ?`,
        [hash, superAdmins[0].id]
      );
      console.log(`\n✅ Verified SuperAdmin account (${superAdmins[0].email}) password set to: Admin@123`);
    }

    // Check HR Admin account
    const [hrAdmins] = await db.query(`SELECT * FROM users WHERE role IN ('admin', 'employer')`);
    if (hrAdmins.length > 0) {
      const pass = 'Admin@123';
      const hash = await bcrypt.hash(pass, 10);
      await db.query(`UPDATE users SET password = ?, status = 'active' WHERE id = ?`, [hash, hrAdmins[0].id]);
      console.log(`✅ Verified HR Admin account (${hrAdmins[0].email}) password set to: Admin@123`);
    }

  } catch (err) {
    console.error('❌ Error checking DB:', err);
  } finally {
    process.exit(0);
  }
}

checkAdminCredentials();
