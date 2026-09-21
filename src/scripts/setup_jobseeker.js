const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupJobSeekerTables() {
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

        // 1. job_seekers table (Identity table similar to employers/employees)
        console.log('📝 Creating/Updating job_seekers table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS job_seekers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                status ENUM('active', 'inactive', 'blocked') DEFAULT 'active',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                CONSTRAINT fk_js_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 2. job_seeker_profiles
        console.log('📝 Creating/Updating job_seeker_profiles table...');
        await connection.query(`
             CREATE TABLE IF NOT EXISTS job_seeker_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_seeker_id INT NOT NULL UNIQUE,
                professional_summary TEXT,
                job_industry VARCHAR(100),
                preferred_location VARCHAR(100),
                visibility ENUM('public', 'hidden') DEFAULT 'public',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_profile_js FOREIGN KEY (job_seeker_id) REFERENCES job_seekers(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 3. job_seeker_skills
        console.log('📝 Creating/Updating job_seeker_skills table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS job_seeker_skills (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_seeker_id INT NOT NULL,
                skill_name VARCHAR(100) NOT NULL,
                proficiency ENUM('beginner', 'intermediate', 'expert'),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_js_skill (job_seeker_id),
                CONSTRAINT fk_skill_js FOREIGN KEY (job_seeker_id) REFERENCES job_seekers(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 4. job_seeker_experience
        console.log('📝 Creating/Updating job_seeker_experience table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS job_seeker_experience (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_seeker_id INT NOT NULL,
                job_title VARCHAR(100) NOT NULL,
                company_name VARCHAR(100) NOT NULL,
                start_date DATE,
                end_date DATE,
                is_current BOOLEAN DEFAULT FALSE,
                description TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_js_exp (job_seeker_id),
                CONSTRAINT fk_exp_js FOREIGN KEY (job_seeker_id) REFERENCES job_seekers(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 5. job_seeker_education
        console.log('📝 Creating/Updating job_seeker_education table...');
        await connection.query(`
             CREATE TABLE IF NOT EXISTS job_seeker_education (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_seeker_id INT NOT NULL,
                degree VARCHAR(100) NOT NULL,
                school_name VARCHAR(200) NOT NULL,
                field_of_study VARCHAR(100),
                start_year INT,
                passing_year INT,
                grade VARCHAR(50),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_js_edu (job_seeker_id),
                CONSTRAINT fk_edu_js FOREIGN KEY (job_seeker_id) REFERENCES job_seekers(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 6. resumes
        console.log('📝 Creating/Updating resumes table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS resumes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_seeker_id INT NOT NULL,
                file_path VARCHAR(255) NOT NULL,
                file_original_name VARCHAR(255),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_js_resume (job_seeker_id),
                CONSTRAINT fk_resume_js FOREIGN KEY (job_seeker_id) REFERENCES job_seekers(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 7. Update job_applications to support job_seeker flow
        console.log('📝 Updating job_applications table logic...');
        // We need to check if columns exist, if not add them.
        try {
            await connection.query(`ALTER TABLE job_applications ADD COLUMN jobseeker_id INT`);
            await connection.query(`ALTER TABLE job_applications ADD COLUMN resume_id INT`);
            await connection.query(`ALTER TABLE job_applications ADD COLUMN applied_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
            console.log('   -> Added jobseeker_id, resume_id, applied_at to job_applications.');
        } catch (e) {
            // Include nice handling for "Duplicate column name" error code 1060
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   -> Columns already exist in job_applications.');
            } else {
                console.log('   -> Warning/Error altering job_applications:', e.message);
            }
        }

        // Add foreign keys for job_applications if possible (might fail if data mismatch, so use try/catch or just indexes)
        // Leaving FK strictness loose on this shared table to avoid breaking existing admin flows if they insert without jobseeker_id

        console.log('🎉 Job Seeker Tables & Schema Setup Completed!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) await connection.end();
    }
}

setupJobSeekerTables();
