
const db = require('../config/mysql');

async function fixAttendanceSchema() {
    try {
        console.log('Checking attendance table...');

        // Create attendance table if not exists with correct schema matching requirements
        const createTableQuery = `
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employer_id INT NOT NULL,
        employee_id INT NOT NULL,
        user_id INT NOT NULL, 
        date DATE NOT NULL,
        check_in TIME,
        check_out TIME,
        total_hours DECIMAL(5,2),
        status ENUM('Present', 'Absent', 'Leave', 'Half-day') DEFAULT 'Present',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_attendance (user_id, date)
      )
    `;

        await db.query(createTableQuery);
        console.log('attendance table checked/created.');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixAttendanceSchema();
