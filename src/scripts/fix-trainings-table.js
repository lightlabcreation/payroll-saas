
const db = require('../config/mysql');

async function fixTrainings() {
    try {
        const connection = await db.getConnection();

        // Drop in reverse dependency order
        console.log("Dropping training_assignments...");
        await connection.query("DROP TABLE IF EXISTS training_assignments");

        console.log("Dropping trainings...");
        await connection.query("DROP TABLE IF EXISTS trainings");

        console.log("Creating trainings...");
        await connection.query(`
      CREATE TABLE trainings (
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE
      )
    `);

        console.log("Creating training_assignments...");
        await connection.query(`
      CREATE TABLE training_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        training_id INT,
        employee_id INT,
        status VARCHAR(50) DEFAULT 'assigned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
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

fixTrainings();
