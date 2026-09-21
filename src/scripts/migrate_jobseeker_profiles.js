const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateJobSeekerProfiles() {
    let connection;
    try {
        console.log('🔌 Connecting to database...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });
        console.log('✅ Connected.');

        console.log('📝 Updating job_seeker_profiles table schema...');

        // Add professional_summary if not exists
        try {
            await connection.query(`ALTER TABLE job_seeker_profiles ADD COLUMN professional_summary TEXT AFTER user_id`);
            console.log('   -> Added professional_summary column.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding professional_summary:', e.message); }

        // Add job_industry if not exists
        try {
            await connection.query(`ALTER TABLE job_seeker_profiles ADD COLUMN job_industry VARCHAR(100) AFTER professional_summary`);
            console.log('   -> Added job_industry column.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding job_industry:', e.message); }

        // Add preferred_location if not exists
        try {
            await connection.query(`ALTER TABLE job_seeker_profiles ADD COLUMN preferred_location VARCHAR(100) AFTER job_industry`);
            console.log('   -> Added preferred_location column.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding preferred_location:', e.message); }

        // Add visibility if not exists
        try {
            await connection.query(`ALTER TABLE job_seeker_profiles ADD COLUMN visibility ENUM('visible', 'hidden') DEFAULT 'visible' AFTER preferred_location`);
            console.log('   -> Added visibility column.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding visibility:', e.message); }

        // Add salary_expectation if not exists
        try {
            await connection.query(`ALTER TABLE job_seeker_profiles ADD COLUMN salary_expectation VARCHAR(100) AFTER visibility`);
            console.log('   -> Added salary_expectation column.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding salary_expectation:', e.message); }

        console.log('🎉 Migration Completed successfully!');

    } catch (error) {
        console.error('❌ Error during migration:', error.message);
    } finally {
        if (connection) await connection.end();
    }
}

migrateJobSeekerProfiles();
