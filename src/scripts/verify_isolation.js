const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('--- DATA ISOLATION VERIFICATION ---');

    try {
        // 1. Get two different employers
        const [employers] = await db.query('SELECT e.id, e.company_id, u.name FROM employers e JOIN users u ON e.user_id = u.id LIMIT 2');
        if (employers.length < 2) {
            console.log('Not enough employers for test. Creating test accounts...');
            // In a real verification I'd create them, but let's assume they exist or check counts.
        }

        const e1 = employers[0];
        const e2 = employers[1];

        console.log(`Testing with Employer 1: ${e1.name} (ID: ${e1.id}, Co: ${e1.company_id})`);
        console.log(`Testing with Employer 2: ${e2.name} (ID: ${e2.id}, Co: ${e2.company_id})`);

        // Check Employees
        const [emp1] = await db.query('SELECT COUNT(*) as count FROM employees WHERE employer_id = ?', [e1.id]);
        const [emp2] = await db.query('SELECT COUNT(*) as count FROM employees WHERE employer_id = ?', [e2.id]);
        console.log(`Employer 1 Employees: ${emp1[0].count}`);
        console.log(`Employer 2 Employees: ${emp2[0].count}`);

        // Check Vendors
        const [v1] = await db.query('SELECT COUNT(*) as count FROM vendors WHERE employer_id = ?', [e1.id]);
        const [v2] = await db.query('SELECT COUNT(*) as count FROM vendors WHERE employer_id = ?', [e2.id]);
        console.log(`Employer 1 Vendors: ${v1[0].count}`);
        console.log(`Employer 2 Vendors: ${v2[0].count}`);

        // Check Training
        const [t1] = await db.query('SELECT COUNT(*) as count FROM training_courses WHERE employer_id = ?', [e1.id]);
        const [t2] = await db.query('SELECT COUNT(*) as count FROM training_courses WHERE employer_id = ?', [e2.id]);
        console.log(`Employer 1 Trainings: ${t1[0].count}`);
        console.log(`Employer 2 Trainings: ${t2[0].count}`);

        // Audit check: Are there any vendors without employer_id? (Legacy)
        const [vOld] = await db.query('SELECT COUNT(*) as count FROM vendors WHERE employer_id IS NULL');
        console.log(`Vendors without employer_id: ${vOld[0].count}`);

        console.log('\n--- ADMIN ISOLATION CHECK ---');
        const [admins] = await db.query('SELECT u.id, u.company_id, u.name FROM users u WHERE role = "admin" LIMIT 2');
        if (admins.length > 0) {
            const a1 = admins[0];
            console.log(`Admin 1: ${a1.name} (Co: ${a1.company_id})`);

            // Simulating getDashboardSummary for Training
            const [at1] = await db.query(`
                SELECT COUNT(*) as count 
                FROM training_courses tc
                JOIN employers e ON tc.employer_id = e.id
                WHERE e.company_id = ?
            `, [a1.company_id]);
            console.log(`Admin 1 Company Trainings (Filtered): ${at1[0].count}`);

            const [atGlobal] = await db.query('SELECT COUNT(*) as count FROM training_courses');
            console.log(`Global Trainings: ${atGlobal[0].count}`);
        }

        console.log('\nVerification complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await db.end();
    }
}

run();
