const db = require('./src/config/mysql');
async function run() {
    const tables = [
        'bill_companies',
        'billing_companies',
        'jobs',
        'job_vacancies',
        'attendance',
        'vendors',
        'job_seekers',
        'job_applications',
        'job_seeker_profiles',
        'training_courses',
        'trainings',
        'course_assignments',
        'training_enrollments'
    ];
    const results = {};
    for (const table of tables) {
        try {
            const [rows] = await db.query('DESCRIBE ' + table);
            results[table] = rows.map(r => ({ field: r.Field, type: r.Type }));
        } catch (e) {
            results[table] = 'MISSING';
        }
    }
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
}
run();
