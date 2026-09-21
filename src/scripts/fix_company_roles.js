const mysql = require('../config/mysql');

const fixRoles = async () => {
    let connection;
    try {
        console.log('Starting Role Fix Migration...');
        connection = await mysql.getConnection();

        // Disable FK checks temporarily to allow patching data structure
        await connection.query('SET FOREIGN_KEY_CHECKS=0');

        try {
            // Find Super Admin ID for 'created_by'
            const [superAdmins] = await connection.query(`SELECT id FROM users WHERE role = 'superadmin' LIMIT 1`);
            const superAdminId = superAdmins.length > 0 ? superAdmins[0].id : 1;
            console.log(`Using SuperAdmin ID: ${superAdminId} for audit fields.`);

            // 1. Get all users who are linked to an employer record but have role = 'employer'
            const [usersToUpgrade] = await connection.query(`
        SELECT u.id, u.email, u.role, e.id as employer_id, e.admin_id
        FROM users u 
        INNER JOIN employers e ON e.user_id = u.id 
        WHERE u.role = 'employer'
      `);

            console.log(`Found ${usersToUpgrade.length} users to upgrade to ADMIN role.`);

            for (const user of usersToUpgrade) {
                console.log(`Processing user ${user.email} (ID: ${user.id})...`);

                // Update user role to 'admin'
                await connection.query(`UPDATE users SET role = 'admin' WHERE id = ?`, [user.id]);

                // Check/Create Admin Record
                let adminRecordId = user.admin_id;

                // If admin_id is null or invalid, we need to ensure an admin record exists
                if (!adminRecordId) {
                    const [existingAdmins] = await connection.query(`SELECT id FROM admins WHERE user_id = ?`, [user.id]);
                    if (existingAdmins.length > 0) {
                        adminRecordId = existingAdmins[0].id;
                    }
                }

                if (!adminRecordId) {
                    console.log(`Creating new admin record for User ${user.id}...`);
                    const [insertRes] = await connection.query(`
            INSERT INTO admins (user_id, created_by, created_at, updated_at)
            VALUES (?, ?, NOW(), NOW())
          `, [user.id, superAdminId]);
                    adminRecordId = insertRes.insertId;
                }

                // Link employer to admin
                if (user.employer_id) {
                    console.log(`Linking Employer ${user.employer_id} to Admin ${adminRecordId}...`);
                    await connection.query(`UPDATE employers SET admin_id = ? WHERE id = ?`, [adminRecordId, user.employer_id]);
                }
            }

            console.log('Migration completed successfully.');

        } catch (err) {
            console.error('Error during migration logic:', err);
        } finally {
            await connection.query('SET FOREIGN_KEY_CHECKS=1');
            connection.release();
        }

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        process.exit();
    }
};

fixRoles();
