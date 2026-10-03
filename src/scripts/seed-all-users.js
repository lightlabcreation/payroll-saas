/**
 * Script to seed all users in the database
 * Run: node src/scripts/seed-all-users.js
 */

const bcrypt = require('bcrypt');
const db = require('../config/mysql');

const users = [
  {
    name: 'Super Admin',
    email: 'superadmin@gmail.com',
    password: '123456',
    role: 'superadmin',
  },
  {
    name: 'Admin User',
    email: 'admin@gmail.com',
    password: '123456',
    role: 'admin',
  },
  {
    name: 'Employer User',
    email: 'employer@gmail.com',
    password: '123456',
    role: 'employer',
  },
  {
    name: 'Employee User',
    email: 'employee@gmail.com',
    password: '123456',
    role: 'employee',
  },
  {
    name: 'Job Seeker User',
    email: 'jobseeker@gmail.com',
    password: '123456',
    role: 'jobseeker',
  },
  {
    name: 'Job Seeker User (Alt)',
    email: 'job@gmail.com',
    password: '123456',
    role: 'jobseeker',
  },
  {
    name: 'Vendor User',
    email: 'vendor@gmail.com',
    password: '123456',
    role: 'vendor',
  },
];

async function seedUsers() {
  const connection = await db.getConnection();
  try {
    console.log('✅ Database connection established.');

    console.log('🌱 Seeding users...\n');

    let superAdminUserId = null;

    // Helper to get or create user
    for (const userData of users) {
      try {
        // Check if user already exists
        const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', [userData.email]);
        let user = rows[0];

        const hashedPassword = await bcrypt.hash(userData.password, 10);

        if (user) {
          // Update existing user
          await connection.query(
            'UPDATE users SET name = ?, password = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
            [userData.name, hashedPassword, userData.role, 'active', user.id]
          );
          console.log(`✅ Updated: ${userData.email} (${userData.role})`);
        } else {
          // Create new user
          const [insert] = await connection.query(
            'INSERT INTO users (name, email, password, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
            [userData.name, userData.email, hashedPassword, userData.role, 'active']
          );
          user = { id: insert.insertId, email: userData.email, role: userData.role };
          console.log(`✅ Created: ${userData.email} (${userData.role})`);
        }

        // Store superadmin id for admin creation
        if (userData.role === 'superadmin') {
          superAdminUserId = user.id;
        }

        // Create role-specific records
        if (userData.role === 'admin') {
          const [adminRows] = await connection.query('SELECT * FROM admins WHERE user_id = ?', [user.id]);
          if (adminRows.length === 0) {
            await connection.query(
              'INSERT INTO admins (user_id, created_by, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
              [user.id, superAdminUserId || 1]
            );
            console.log(`   └─ Admin record created`);
          }
        } else if (userData.role === 'employer') {
          const [employerRows] = await connection.query('SELECT * FROM employers WHERE user_id = ?', [user.id]);
          if (employerRows.length === 0) {
            const [empInsert] = await connection.query(
              'INSERT INTO employers (user_id, company_name, company_address, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
              [user.id, 'Sample Company', '123 Main Street, City', 'active']
            );
            console.log(`   └─ Employer record created (ID: ${empInsert.insertId})`);
          }
        } else if (userData.role === 'employee') {
          // Find first employer
          const [empRows] = await connection.query('SELECT id FROM employers LIMIT 1');
          const employer = empRows[0];
          if (employer) {
            const [employeeRows] = await connection.query('SELECT * FROM employees WHERE user_id = ?', [user.id]);
            if (employeeRows.length === 0) {
              await connection.query(
                `INSERT INTO employees (user_id, employer_id, designation, salary, status, created_at, updated_at) 
                 VALUES (?, ?, 'Software Developer', 75000, 'active', NOW(), NOW())`,
                [user.id, employer.id]
              );
              console.log(`   └─ Employee record created`);
            }
          }
        } else if (userData.role === 'vendor') {
          const [vendorRows] = await connection.query('SELECT * FROM vendors WHERE user_id = ?', [user.id]);
          if (vendorRows.length === 0) {
            await connection.query(
              `INSERT INTO vendors (user_id, company_name, services, payment_status, created_at, updated_at) 
               VALUES (?, 'Sample Vendor Company', 'IT Services, Consulting', 'pending', NOW(), NOW())`,
              [user.id]
            );
            console.log(`   └─ Vendor record created`);
          }
        }

        // Verify password hash
        const isMatch = await bcrypt.compare('123', hashedPassword);
        console.log(`   └─ Password verification: ${isMatch ? '✅ Match' : '❌ Mismatch'}`);

      } catch (error) {
        console.error(`❌ Error creating ${userData.email}:`, error.message);
      }
    }

    console.log('\n📊 Summary:');
    const [allUsers] = await connection.query('SELECT id, email, role, status FROM users ORDER BY id ASC');

    console.table(allUsers.map(u => ({
      ID: u.id,
      Email: u.email,
      Role: u.role,
      Status: u.status,
    })));

    console.log('\n✅ All users seeded successfully!');
    console.log('\n📝 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    users.forEach(u => {
      console.log(`${u.role.padEnd(15)} | ${u.email.padEnd(25)} | Password: 123`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  } finally {
    if (connection) connection.release();
    // Pool remains open unless we close it, but usually scripts exit.
    // We can import pool and call end() if needed, but db module exports pool.
    // db.end(); // If db exposes end
  }
}

// Run if called directly
if (require.main === module) {
  seedUsers()
    .then(() => {
      console.log('✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedUsers };

