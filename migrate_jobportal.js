const db = require('./src/config/mysql');

async function migrate() {
    try {
        console.log('Starting migration for Job Portal...');

        // Correct resumes table
        await db.query(`ALTER TABLE resumes 
            ADD COLUMN IF NOT EXISTS title VARCHAR(200) DEFAULT "My Resume",
            ADD COLUMN IF NOT EXISTS is_default TINYINT(1) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1,
            ADD COLUMN IF NOT EXISTS resume_data LONGTEXT`);
        console.log('Resumes table updated.');

        // Correct job_seekers table (ensure user_id exists)
        await db.query(`ALTER TABLE job_seekers 
            ADD COLUMN IF NOT EXISTS user_id INT,
            ADD UNIQUE KEY IF NOT EXISTS (user_id)`);
        console.log('Job Seekers table updated.');

        // Populate user_id in job_seekers if possible
        await db.query(`UPDATE job_seekers js 
            JOIN users u ON js.email = u.email 
            SET js.user_id = u.id 
            WHERE js.user_id IS NULL`);
        console.log('Job Seekers user_id populated.');

        // Update job_applications status enum if needed
        // Note: Using a safe approach to update enum
        try {
            await db.query(`ALTER TABLE job_applications 
                MODIFY COLUMN status ENUM('Under Review', 'Shortlisted', 'Interview Scheduled', 'Rejected', 'Accepted', 'pending') DEFAULT 'Under Review'`);
            console.log('Job Applications status enum updated.');
        } catch (e) {
            console.warn('Could not update job_applications status enum, might already be correct or different. Skipping.');
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
