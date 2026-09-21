require('dotenv').config();
const db = require('../config/mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

async function verifyLogins() {
  console.log('=== VERIFYING LOGIN ACCOUNTS ===\n');
  try {
    const testAccounts = [
      { role: 'Super Admin', email: 'superadmin@gmail.com', pass: 'Admin@123' },
      { role: 'HR Admin', email: 'admin@gmail.com', pass: 'Admin@123' }
    ];

    for (const acc of testAccounts) {
      const hash = await bcrypt.hash(acc.pass, 10);
      await db.query(`UPDATE users SET password = ?, status = 'active' WHERE email = ?`, [hash, acc.email]);
      
      const [rows] = await db.query(`SELECT * FROM users WHERE email = ?`, [acc.email]);
      if (rows.length > 0) {
        const u = rows[0];
        const match = await bcrypt.compare(acc.pass, u.password);
        console.log(`✅ ${acc.role} Login Check:`);
        console.log(`   Email: ${u.email}`);
        console.log(`   Password: ${acc.pass}`);
        console.log(`   Role in DB: ${u.role}`);
        console.log(`   Status: ${u.status}`);
        console.log(`   Password Verification: ${match ? 'SUCCESS' : 'FAILED'}\n`);
      }
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    process.exit(0);
  }
}

verifyLogins();
