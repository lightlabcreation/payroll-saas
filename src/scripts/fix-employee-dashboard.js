
const db = require('../config/mysql');

async function migrate() {
    const connection = await db.getConnection();
    try {
        console.log('Starting migration to fix Employee Dashboard...');

        // 1. salary_records
        console.log('Fixing salary_records...');
        const [salaryCols] = await connection.query("SHOW COLUMNS FROM salary_records");
        const salaryColNames = salaryCols.map(c => c.Field);

        if (!salaryColNames.includes('payment_date')) {
            await connection.query("ALTER TABLE salary_records ADD COLUMN payment_date DATETIME AFTER status");
        }
        if (!salaryColNames.includes('basic_salary')) {
            await connection.query("ALTER TABLE salary_records ADD COLUMN basic_salary DECIMAL(10,2) AFTER amount");
        }
        if (!salaryColNames.includes('hra')) {
            await connection.query("ALTER TABLE salary_records ADD COLUMN hra DECIMAL(10,2) AFTER basic_salary");
        }
        if (!salaryColNames.includes('pf')) {
            await connection.query("ALTER TABLE salary_records ADD COLUMN pf DECIMAL(10,2) AFTER hra");
        }
        if (!salaryColNames.includes('gross_salary')) {
            await connection.query("ALTER TABLE salary_records ADD COLUMN gross_salary DECIMAL(10,2) AFTER pf");
        }
        if (!salaryColNames.includes('net_salary')) {
            await connection.query("ALTER TABLE salary_records ADD COLUMN net_salary DECIMAL(10,2) AFTER gross_salary");
        }
        if (!salaryColNames.includes('special_allowance')) await connection.query("ALTER TABLE salary_records ADD COLUMN special_allowance DECIMAL(10,2)");
        if (!salaryColNames.includes('lta')) await connection.query("ALTER TABLE salary_records ADD COLUMN lta DECIMAL(10,2)");
        if (!salaryColNames.includes('professional_tax')) await connection.query("ALTER TABLE salary_records ADD COLUMN professional_tax DECIMAL(10,2)");
        if (!salaryColNames.includes('tds')) await connection.query("ALTER TABLE salary_records ADD COLUMN tds DECIMAL(10,2)");

        // 2. bank_details
        console.log('Fixing bank_details...');
        const [bankCols] = await connection.query("SHOW COLUMNS FROM bank_details");
        const bankColNames = bankCols.map(c => c.Field);

        if (!bankColNames.includes('employee_id')) {
            await connection.query("ALTER TABLE bank_details ADD COLUMN employee_id INT AFTER id");
        }
        if (!bankColNames.includes('account_holder_name')) await connection.query("ALTER TABLE bank_details ADD COLUMN account_holder_name VARCHAR(100)");
        if (!bankColNames.includes('branch_name')) await connection.query("ALTER TABLE bank_details ADD COLUMN branch_name VARCHAR(100)");
        if (!bankColNames.includes('account_type')) await connection.query("ALTER TABLE bank_details ADD COLUMN account_type VARCHAR(50)");

        // 3. jobs
        console.log('Fixing jobs...');
        const [jobCols] = await connection.query("SHOW COLUMNS FROM jobs");
        const jobColNames = jobCols.map(c => c.Field);
        if (!jobColNames.includes('salary_min')) await connection.query("ALTER TABLE jobs ADD COLUMN salary_min DECIMAL(10,2)");
        if (!jobColNames.includes('salary_max')) await connection.query("ALTER TABLE jobs ADD COLUMN salary_max DECIMAL(10,2)");

        // 4. bills
        console.log('Fixing bills...');
        const [billCols] = await connection.query("SHOW COLUMNS FROM bills");
        const billColNames = billCols.map(c => c.Field);
        if (!billColNames.includes('employee_id')) await connection.query("ALTER TABLE bills ADD COLUMN employee_id INT AFTER id");
        if (!billColNames.includes('name')) await connection.query("ALTER TABLE bills ADD COLUMN name VARCHAR(255)");
        if (!billColNames.includes('description')) await connection.query("ALTER TABLE bills ADD COLUMN description TEXT");
        if (!billColNames.includes('paid_date')) await connection.query("ALTER TABLE bills ADD COLUMN paid_date DATETIME");

        // 5. attendance
        console.log('Fixing attendance...');
        const [attCols] = await connection.query("SHOW COLUMNS FROM attendance");
        const attColNames = attCols.map(c => c.Field);
        if (!attColNames.includes('working_hours')) await connection.query("ALTER TABLE attendance ADD COLUMN working_hours DECIMAL(5,2)");

        await connection.query("ALTER TABLE attendance MODIFY COLUMN status VARCHAR(50)");

        // 6. job_applications
        console.log('Fixing job_applications...');
        try {
            const [appCols] = await connection.query("SHOW COLUMNS FROM job_applications");
            const appColNames = appCols.map(c => c.Field);
            if (!appColNames.includes('jobseeker_id')) await connection.query("ALTER TABLE job_applications ADD COLUMN jobseeker_id INT AFTER id");
            if (!appColNames.includes('applied_at')) await connection.query("ALTER TABLE job_applications ADD COLUMN applied_at DATETIME DEFAULT CURRENT_TIMESTAMP");
            if (!appColNames.includes('resume')) await connection.query("ALTER TABLE job_applications ADD COLUMN resume VARCHAR(255)");
        } catch (e) {
            console.log('job_applications table fix skipped/failed:', e.message);
        }

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
