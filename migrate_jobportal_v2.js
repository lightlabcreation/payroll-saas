const db = require('./src/config/mysql');

async function migrate() {
    try {
        console.log('Running secondary migration for Job Portal columns...');

        // Update job_seekers
        await db.query(`ALTER TABLE job_seekers 
            ADD COLUMN IF NOT EXISTS location VARCHAR(255),
            ADD COLUMN IF NOT EXISTS user_id INT,
            ADD UNIQUE KEY IF NOT EXISTS uq_user_id (user_id)`);

        // Update job_seeker_profiles
        await db.query(`ALTER TABLE job_seeker_profiles 
            ADD COLUMN IF NOT EXISTS salary_expectation VARCHAR(100)`);

        // Ensure resumes has title
        await db.query(`ALTER TABLE resumes 
            ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT 'My Resume'`);

        console.log('Secondary migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
