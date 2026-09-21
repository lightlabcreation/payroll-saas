
const db = require('../config/mysql');

async function verify() {
    try {
        console.log('Verifying Employee Dashboard fixes...');

        // 1. salary_records
        await db.query("SELECT id, payment_date FROM salary_records LIMIT 1");
        console.log('✅ salary_records.payment_date is accessible');

        // 2. bank_details
        await db.query("SELECT id, employee_id, account_holder_name FROM bank_details LIMIT 1");
        console.log('✅ bank_details.employee_id and account_holder_name are accessible');

        // 3. jobs
        await db.query("SELECT id, salary_min, salary_max FROM jobs LIMIT 1");
        console.log('✅ jobs.salary_min and salary_max are accessible');

        // 4. bills
        await db.query("SELECT id, employee_id, name, paid_date FROM bills LIMIT 1");
        console.log('✅ bills.employee_id, name, and paid_date are accessible');

        // 5. Training
        await db.query("SELECT id, trainer_name, location FROM training_courses LIMIT 1");
        console.log('✅ training_courses.trainer_name and location are accessible');

        await db.query("SELECT id, training_id, employee_id, check_in_time FROM training_enrollments LIMIT 1");
        console.log('✅ training_enrollments is accessible');

        // 6. Job applications
        await db.query("SELECT id, jobseeker_id, applied_at FROM job_applications LIMIT 1");
        console.log('✅ job_applications.jobseeker_id and applied_at are accessible');

        console.log('\nAll Employee Dashboard DB queries verified successfully!');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Verification failed:', err.message);
        process.exit(1);
    }
}

verify();
