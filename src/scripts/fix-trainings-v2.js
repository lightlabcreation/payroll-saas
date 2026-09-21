
const db = require('../config/mysql');

async function fixTrainingsV2() {
    try {
        const connection = await db.getConnection();

        console.log("Creating training_courses (no FK)...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS training_courses (
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

        console.log("Creating training_enrollments (no FK)...");
        await connection.query(`
      CREATE TABLE IF NOT EXISTS training_enrollments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        training_id INT,
        employee_id INT,
        status VARCHAR(50) DEFAULT 'assigned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        console.log("Done.");
        connection.release();
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixTrainingsV2();
