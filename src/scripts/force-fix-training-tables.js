
const db = require('../config/mysql');

async function forceFixTrainingTables() {
    try {
        console.log('--- FORCE FIXING TRAINING TABLES ---');
        const connection = await db.getConnection();

        // Check employer ID type
        try {
            const [cols] = await connection.query("DESCRIBE employers");
            const idCol = cols.find(c => c.Field === 'id');
            console.log('Employers ID definition:', idCol.Type);
        } catch (e) {
            console.log("Could not describe employers:", e.message);
        }

        // DROP existing training tables to start fresh
        console.log('Dropping assignments...');
        await connection.query('DROP TABLE IF EXISTS training_assignments');
        console.log('Dropping materials...');
        await connection.query('DROP TABLE IF EXISTS training_materials');
        console.log('Dropping trainings...');
        await connection.query('DROP TABLE IF EXISTS trainings');

        // RE-CREATE without foreign key constraints first to ensure success
        console.log('Creating trainings...');
        await connection.query(`
            CREATE TABLE trainings (
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

        console.log('Creating training_materials...');
        await connection.query(`
            CREATE TABLE training_materials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                training_id INT NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_url VARCHAR(500) NOT NULL,
                file_type VARCHAR(50),
                file_size VARCHAR(50),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);

        console.log('Creating training_assignments...');
        await connection.query(`
            CREATE TABLE training_assignments (
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

        console.log('All tables created successfully (Logic-only FKs).');
        connection.release();

    } catch (error) {
        console.error('CRITICAL ERROR FIXING TABLES:', error);
    } finally {
        process.exit();
    }
}

forceFixTrainingTables();
