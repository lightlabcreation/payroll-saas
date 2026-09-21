const db = require('../config/mysql');

async function verifyRoleHierarchy() {
    console.log('\n🔍 VERIFYING ROLE HIERARCHY & SCHEMA\n');
    console.log('='.repeat(60));

    try {
        // 1. Check Users Table Structure
        console.log('\n1️⃣ USERS TABLE STRUCTURE:');
        const [userCols] = await db.query('DESCRIBE users');
        console.table(userCols.map(c => ({ Field: c.Field, Type: c.Type, Key: c.Key })));

        // 2. Check Companies Table
        console.log('\n2️⃣ COMPANIES TABLE STRUCTURE:');
        const [companyCols] = await db.query('DESCRIBE companies');
        console.table(companyCols.map(c => ({ Field: c.Field, Type: c.Type, Key: c.Key })));

        // 3. Check existing users and their roles
        console.log('\n3️⃣ ALL USERS & THEIR ROLES:');
        const [users] = await db.query(`
      SELECT id, name, email, role, company_id, status 
      FROM users 
      ORDER BY id
    `);
        console.table(users);

        // 4. Check Companies and their Admin links
        console.log('\n4️⃣ COMPANIES & ADMIN LINKS:');
        const [companies] = await db.query(`
      SELECT 
        c.id as company_id,
        c.company_name,
        c.admin_id,
        c.user_id,
        u.name as admin_name,
        u.email as admin_email,
        u.role as admin_role,
        a.id as admin_record_id
      FROM companies c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN admins a ON c.admin_id = a.id
    `);
        console.table(companies);

        // 5. Check Admins Table
        console.log('\n5️⃣ ADMINS TABLE:');
        const [admins] = await db.query(`
      SELECT a.id, a.user_id, u.name, u.email, u.role
      FROM admins a
      JOIN users u ON a.user_id = u.id
    `);
        console.table(admins);

        // 6. Check for role violations
        console.log('\n6️⃣ ROLE VIOLATIONS CHECK:');

        // Check if any ADMIN has company_id = NULL
        const [adminsWithoutCompany] = await db.query(`
      SELECT id, name, email, role, company_id
      FROM users
      WHERE role = 'admin' AND company_id IS NULL
    `);
        if (adminsWithoutCompany.length > 0) {
            console.log('⚠️  ADMINS WITHOUT COMPANY:');
            console.table(adminsWithoutCompany);
        } else {
            console.log('✅ All ADMINs have company_id');
        }

        // Check if any company has no admin
        const [companiesWithoutAdmin] = await db.query(`
      SELECT id, company_name, user_id, admin_id
      FROM companies
      WHERE user_id IS NULL OR admin_id IS NULL
    `);
        if (companiesWithoutAdmin.length > 0) {
            console.log('⚠️  COMPANIES WITHOUT ADMIN:');
            console.table(companiesWithoutAdmin);
        } else {
            console.log('✅ All Companies have admin_id');
        }

        // 7. Test Login Response
        console.log('\n7️⃣ TESTING LOGIN RESPONSE FORMAT:');
        const [testUser] = await db.query(`
      SELECT id, name, email, role, company_id, status
      FROM users
      WHERE role = 'admin'
      LIMIT 1
    `);
        if (testUser.length > 0) {
            console.log('Sample ADMIN user for login:');
            console.log({
                user: {
                    id: testUser[0].id,
                    name: testUser[0].name,
                    email: testUser[0].email,
                    role: testUser[0].role,
                    status: testUser[0].status,
                }
            });
            console.log('\n✅ This should redirect to: /Admin/dashboard');
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ VERIFICATION COMPLETE\n');

    } catch (error) {
        console.error('❌ ERROR:', error.message);
    } finally {
        process.exit(0);
    }
}

verifyRoleHierarchy();
