const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixProfiles() {
    let connection;
    try {
        console.log("🚀 Starting Profile Fix...");
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        // 1. Get all users with role 'jobseeker'
        const [users] = await connection.query("SELECT id, name FROM users WHERE role = 'jobseeker'");
        console.log(`Found ${users.length} jobseekers.`);

        for (const user of users) {
            // 2. Check if profile exists
            const [profiles] = await connection.query("SELECT * FROM job_seeker_profiles WHERE user_id = ?", [user.id]);

            if (profiles.length === 0) {
                console.log(`⚠️ No profile for ${user.name} (${user.id}). Creating default...`);
                await connection.query(`
                    INSERT INTO job_seeker_profiles (user_id, skills, experience, education, current_company, level)
                    VALUES (?, 'React, Node.js', '2 Years', 'B.Tech', 'Tech Corp', 'Mid-level')
                 `, [user.id]);
                console.log(`✅ Profile created for ${user.name}`);
            } else {
                console.log(`ℹ️ Profile exists for ${user.name}`);
            }
        }

        console.log("✅ Fix complete.");

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

fixProfiles();
