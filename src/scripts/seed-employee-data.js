
const db = require('../config/mysql');

async function seed() {
    try {
        const employeeId = 1;
        const userId = 13;
        const employerId = 8;

        console.log('Seeding sample data for Employee 1...');

        // 1. Bank Details
        await db.query(`
      INSERT INTO bank_details (employee_id, bank_name, account_number, ifsc_code, account_holder_name, branch_name, account_type, is_primary)
      VALUES (?, 'State Bank of India', '1234567890', 'SBIN0001234', 'Yash', 'Main Branch', 'salary', 1)
      ON DUPLICATE KEY UPDATE account_number=account_number
    `, [employeeId]);

        // 2. Salary Record
        const now = new Date();
        const currentMonth = now.toLocaleString('default', { month: 'long' });
        const currentYear = now.getFullYear();
        await db.query(`
      INSERT INTO salary_records (employee_id, amount, basic_salary, hra, pf, gross_salary, net_salary, month, year, status, payment_date)
      VALUES (?, 50000, 30000, 10000, 2400, 50000, 45000, ?, ?, 'paid', NOW())
    `, [employeeId, currentMonth, currentYear]);

        // 3. Attendance
        const today = new Date().toISOString().slice(0, 10);
        await db.query(`
      INSERT INTO attendance (employee_id, user_id, date, check_in, status)
      VALUES (?, ?, ?, '09:00:00', 'present')
      ON DUPLICATE KEY UPDATE check_in='09:00:00'
    `, [employeeId, userId, today]);

        // 4. Training Course
        const [tResult] = await db.query(`
      INSERT INTO training_courses (employer_id, title, description, trainer_name, start_date, end_date, location, status)
      VALUES (?, 'Onboarding Training', 'Introduction to company policies', 'HR Manager', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY), 'Online', 'scheduled')
    `, [employerId]);
        const trainingId = tResult.insertId;

        // 5. Training Enrollment
        await db.query(`
      INSERT INTO training_enrollments (training_id, employee_id, status)
      VALUES (?, ?, 'assigned')
    `, [trainingId, employeeId]);

        // 6. Bills
        await db.query(`
       INSERT INTO bills (employee_id, name, amount, due_date, status, description)
       VALUES (?, 'Internet Bill', 999, DATE_ADD(NOW(), INTERVAL 7 DAY), 'pending', 'Monthly internet charges')
    `, [employeeId]);

        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();
