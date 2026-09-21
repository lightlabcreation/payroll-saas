const db = require('../config/mysql');

async function fixRoleAndAdminLinks() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        console.log('🔧 FIXING ROLE & ADMIN LINK ISSUES\n');
        console.log('='.repeat(60));

        // STEP 1: Fix User ID 47 - Change from 'employer' to 'admin'
        console.log('\n1️⃣ Fixing User ID 47 role from employer → admin');
        await connection.query(`
      UPDATE users 
      SET role = 'admin' 
      WHERE id = 47
    `);
        console.log('✅ User 47 role updated to ADMIN');

        // STEP 2: Create admin records for both users (or get existing)
        console.log('\n2️⃣ Ensuring admin records exist in admins table');

        // For User 44 (admin@gmail.com)
        const [existing44] = await connection.query('SELECT id FROM admins WHERE user_id = 44');
        let admin44Id;
        if (existing44.length > 0) {
            admin44Id = existing44[0].id;
            console.log(`ℹ️  Admin record already exists for User 44 - admin_id: ${admin44Id}`);
        } else {
            const [admin44Result] = await connection.query(`
        INSERT INTO admins (user_id, created_by, created_at, updated_at)
        VALUES (44, 4, NOW(), NOW())
      `);
            admin44Id = admin44Result.insertId;
            console.log(`✅ Admin record created for User 44 (admin@gmail.com) - admin_id: ${admin44Id}`);
        }

        // For User 47 (adminji@gmail.com)
        const [existing47] = await connection.query('SELECT id FROM admins WHERE user_id = 47');
        let admin47Id;
        if (existing47.length > 0) {
            admin47Id = existing47[0].id;
            console.log(`ℹ️  Admin record already exists for User 47 - admin_id: ${admin47Id}`);
        } else {
            const [admin47Result] = await connection.query(`
        INSERT INTO admins (user_id, created_by, created_at, updated_at)
        VALUES (47, 4, NOW(), NOW())
      `);
            admin47Id = admin47Result.insertId;
            console.log(`✅ Admin record created for User 47 (adminji@gmail.com) - admin_id: ${admin47Id}`);
        }

        // STEP 3: Link companies to their admin records
        console.log('\n3️⃣ Linking companies to admin records');

        await connection.query(`
      UPDATE companies 
      SET admin_id = ? 
      WHERE id = 28
    `, [admin44Id]);
        console.log(`✅ Company 28 (Kiaan) linked to admin_id: ${admin44Id}`);

        await connection.query(`
      UPDATE companies 
      SET admin_id = ? 
      WHERE id = 31
    `, [admin47Id]);
        console.log(`✅ Company 31 (sdfc) linked to admin_id: ${admin47Id}`);

        await connection.commit();

        // VERIFICATION
        console.log('\n' + '='.repeat(60));
        console.log('\n✅ VERIFICATION AFTER FIX:');

        const [users] = await connection.query(`
      SELECT id, name, email, role, company_id 
      FROM users 
      WHERE id IN (44, 47)
    `);
        console.log('\n👤 Updated Users:');
        console.table(users);

        const [companies] = await connection.query(`
      SELECT c.id, c.company_name, c.admin_id, c.user_id, u.role
      FROM companies c
      JOIN users u ON c.user_id = u.id
    `);
        console.log('\n🏢 Updated Companies:');
        console.table(companies);

        const [admins] = await connection.query(`
      SELECT a.id as admin_id, a.user_id, u.name, u.email, u.role
      FROM admins a
      JOIN users u ON a.user_id = u.id
    `);
        console.log('\n👨‍💼 Admins Table:');
        console.table(admins);

        console.log('\n' + '='.repeat(60));
        console.log('\n✅ ALL FIXES APPLIED SUCCESSFULLY!');
        console.log('\n📝 NOW TEST LOGIN:');
        console.log('   Email: admin@gmail.com OR adminji@gmail.com');
        console.log('   Expected: Should redirect to /Admin/dashboard');
        console.log('\n');

    } catch (error) {
        await connection.rollback();
        console.error('❌ ERROR:', error.message);
        throw error;
    } finally {
        connection.release();
        process.exit(0);
    }
}

fixRoleAndAdminLinks();
