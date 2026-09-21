const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTables() {
    let connection;
    try {
        console.log("🚀 Recreating tables...");
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        // Drop job_seeker_profiles if exists to reset schema
        await connection.query('DROP TABLE IF EXISTS job_seeker_profiles');
        console.log("🗑️ Dropped job_seeker_profiles");

        // Recreate without FK for now to debug
        await connection.query(`
            CREATE TABLE job_seeker_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                skills TEXT,
                experience VARCHAR(100),
                education VARCHAR(200),
                current_company VARCHAR(150),
                level VARCHAR(50),
                resume_url VARCHAR(255)
            )
        `);
        console.log("✅ job_seeker_profiles table recreated (No FK).");

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

createTables();
