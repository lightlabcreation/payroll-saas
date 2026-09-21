
const db = require('../config/mysql');

async function migrate() {
    const connection = await db.getConnection();
    try {
        console.log('Starting migration for New Employee Dashboard Features...');

        // 1. Users/Employees profile expansion
        console.log('Expanding profile fields...');
        const [userCols] = await connection.query("SHOW COLUMNS FROM users");
        const userColNames = userCols.map(c => c.Field);
        if (!userColNames.includes('phone')) await connection.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20)");
        if (!userColNames.includes('address')) await connection.query("ALTER TABLE users ADD COLUMN address TEXT");
        if (!userColNames.includes('profile_image')) await connection.query("ALTER TABLE users ADD COLUMN profile_image VARCHAR(255)");

        const [empCols] = await connection.query("SHOW COLUMNS FROM employees");
        const empColNames = empCols.map(c => c.Field);
        if (!empColNames.includes('emergency_contact')) await connection.query("ALTER TABLE employees ADD COLUMN emergency_contact VARCHAR(100)");

        // 2. Training enrollment expansion (for tests/certificates)
        console.log('Expanding training enrollment for tests/certificates...');
        const [enrollCols] = await connection.query("SHOW COLUMNS FROM training_enrollments");
        const enrollColNames = enrollCols.map(c => c.Field);
        if (!enrollColNames.includes('test_score')) await connection.query("ALTER TABLE training_enrollments ADD COLUMN test_score INT");
        if (!enrollColNames.includes('test_status')) await connection.query("ALTER TABLE training_enrollments ADD COLUMN test_status VARCHAR(50) DEFAULT 'pending'");
        if (!enrollColNames.includes('certificate_url')) await connection.query("ALTER TABLE training_enrollments ADD COLUMN certificate_url VARCHAR(255)");
        if (!enrollColNames.includes('certificate_id')) await connection.query("ALTER TABLE training_enrollments ADD COLUMN certificate_id VARCHAR(100)");

        // 3. Bank details expansion
        console.log('Expanding bank details...');
        const [bankCols] = await connection.query("SHOW COLUMNS FROM bank_details");
        const bankColNames = bankCols.map(c => c.Field);
        if (!bankColNames.includes('balance')) await connection.query("ALTER TABLE bank_details ADD COLUMN balance DECIMAL(15,2) DEFAULT 0");
        if (!bankColNames.includes('status')) await connection.query("ALTER TABLE bank_details ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
        if (!bankColNames.includes('verification_status')) await connection.query("ALTER TABLE bank_details ADD COLUMN verification_status VARCHAR(20) DEFAULT 'pending'");

        // 4. Bills expansion
        console.log('Expanding bills...');
        const [billCols] = await connection.query("SHOW COLUMNS FROM bills");
        const billColNames = billCols.map(c => c.Field);
        if (!billColNames.includes('paid_by')) await connection.query("ALTER TABLE bills ADD COLUMN paid_by INT"); // referencing employers.id

        // 5. Training Courses
        const [courseCols] = await connection.query("SHOW COLUMNS FROM training_courses");
        const courseColNames = courseCols.map(c => c.Field);
        if (!courseColNames.includes('due_date')) await connection.query("ALTER TABLE training_courses ADD COLUMN due_date DATETIME");

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        connection.release();
    }
}

migrate();
