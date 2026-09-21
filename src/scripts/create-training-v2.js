
const db = require('../config/mysql');

async function createNewTrainingTables() {
    try {
        console.log('--- CREATING V2 TRAINING TABLES (Bypassing corruption) ---');
        const connection = await db.getConnection();

        // 1. training_courses (was trainings)
        // Note: Using 'training_courses' to avoid 'trainings' corruption
        await connection.query(`
            CREATE TABLE IF NOT EXISTS training_courses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employer_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                instructor VARCHAR(255),
                duration VARCHAR(100),
                category VARCHAR(100) DEFAULT 'Technical',
                description TEXT,
                start_date DATETIME,
                end_date DATETIME,
                status VARCHAR(50) DEFAULT 'Upcoming',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);
        console.log('Created training_courses table.');

        // 2. course_materials (was training_materials)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS course_materials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                training_id INT NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_url VARCHAR(500) NOT NULL,
                file_type VARCHAR(50),
                file_size VARCHAR(50),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);
        console.log('Created course_materials table.');

        // 3. course_assignments (was training_assignments)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS course_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                training_id INT NOT NULL,
                employee_id INT NOT NULL,
                status VARCHAR(50) DEFAULT 'Assigned',
                score DECIMAL(5, 2) DEFAULT 0,
                completion_date DATETIME,
                certificate_status VARCHAR(50) DEFAULT 'Pending',
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);
        console.log('Created course_assignments table.');

        console.log('V2 Tables created successfully.');
        connection.release();

    } catch (error) {
        console.error('Error creating v2 tables:', error);
    } finally {
        process.exit();
    }
}

createNewTrainingTables();
