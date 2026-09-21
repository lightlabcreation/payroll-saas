
const db = require('../config/mysql');

async function fixSchema() {
    try {
        console.log('--- Fixing Schema ---');
        const connection = await db.getConnection();

        // 1. Create trainings table
        await connection.query(`
      CREATE TABLE IF NOT EXISTS trainings (
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
        console.log('trainings table checked/created.');

        // 2. Create training_assignments table
        await connection.query(`
      CREATE TABLE IF NOT EXISTS training_assignments (
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
        console.log('training_assignments table checked/created.');

        // 3. Check employees table for employer_id
        const [empCols] = await connection.query("SHOW COLUMNS FROM employees LIKE 'employer_id'");
        if (empCols.length === 0) {
            console.log("Adding employer_id to employees table...");
            await connection.query("ALTER TABLE employees ADD COLUMN employer_id INT AFTER user_id");
            await connection.query("ALTER TABLE employees ADD CONSTRAINT fk_emp_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE SET NULL");

            // Attempt to backfill? 
            // If employees have company_id, and employers have company_id...
            // For now, leave NULL.
        } else {
            console.log("employees table already has employer_id.");
        }

        connection.release();
        console.log('Schema fix complete.');
        process.exit();
    } catch (error) {
        console.error('Schema fix failed:', error);
        process.exit(1);
    }
}

fixSchema();
