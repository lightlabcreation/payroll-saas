
const db = require('../config/mysql');

async function fixTrainingTables() {
    const connection = await db.getConnection();
    try {
        console.log('Recreating training tables with correct schema...');

        await connection.query("SET FOREIGN_KEY_CHECKS = 0");
        await connection.query("DROP TABLE IF EXISTS training_enrollments");
        await connection.query("DROP TABLE IF EXISTS training_courses");
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");

        await connection.query(`
      CREATE TABLE training_courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employer_id INT,
        title VARCHAR(255),
        description TEXT,
        trainer_name VARCHAR(255),
        start_date DATETIME,
        end_date DATETIME,
        location VARCHAR(255),
        max_participants INT,
        status VARCHAR(50) DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        await connection.query(`
      CREATE TABLE training_enrollments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        training_id INT,
        employee_id INT,
        status VARCHAR(50) DEFAULT 'assigned',
        check_in_time DATETIME,
        check_out_time DATETIME,
        feedback TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        console.log('Training tables recreated successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Failed to recreate training tables:', err);
        process.exit(1);
    } finally {
        connection.release();
    }
}

fixTrainingTables();
