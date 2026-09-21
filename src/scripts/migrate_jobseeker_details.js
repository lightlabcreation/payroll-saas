const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateJobSeekerDetails() {
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

        console.log('📝 Updating specialized profile tables...');

        // Update job_seeker_experience
        try {
            await connection.query(`ALTER TABLE job_seeker_experience ADD COLUMN duration VARCHAR(100) AFTER end_date`);
            console.log('   -> Added duration column to job_seeker_experience.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding duration to experience:', e.message); }

        try {
            await connection.query(`ALTER TABLE job_seeker_experience MODIFY COLUMN job_title VARCHAR(100) NULL`);
            await connection.query(`ALTER TABLE job_seeker_experience MODIFY COLUMN company_name VARCHAR(100) NULL`);
            console.log('   -> Relaxed NOT NULL constraints on job_seeker_experience.');
        } catch (e) { console.log('Error modifying experience columns:', e.message); }

        // Update job_seeker_education
        try {
            await connection.query(`ALTER TABLE job_seeker_education ADD COLUMN duration VARCHAR(100) AFTER passing_year`);
            console.log('   -> Added duration column to job_seeker_education.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding duration to education:', e.message); }

        try {
            await connection.query(`ALTER TABLE job_seeker_education ADD COLUMN institution VARCHAR(200) AFTER school_name`);
            console.log('   -> Added institution column to job_seeker_education.');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('Error adding institution to education:', e.message); }

        try {
            await connection.query(`ALTER TABLE job_seeker_education MODIFY COLUMN degree VARCHAR(100) NULL`);
            await connection.query(`ALTER TABLE job_seeker_education MODIFY COLUMN school_name VARCHAR(200) NULL`);
            console.log('   -> Relaxed NOT NULL constraints on job_seeker_education.');
        } catch (e) { console.log('Error modifying education columns:', e.message); }

        console.log('🎉 Migration Completed successfully!');

    } catch (error) {
        console.error('❌ Error during migration:', error.message);
    } finally {
        if (connection) await connection.end();
    }
}

migrateJobSeekerDetails();
