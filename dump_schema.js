const db = require('./src/config/mysql');
async function run() {
    try {
        console.log('--- TABLES ---');
        const [tables] = await db.query('SHOW TABLES');
        console.log(tables.map(t => Object.values(t)[0]));

        const targetTables = ['users', 'employers', 'companies', 'employees', 'vendors', 'transactions', 'jobs', 'job_applications', 'credits'];
        for (const table of targetTables) {
            console.log(`\n--- SCHEMA: ${table} ---`);
            const [cols] = await db.query(`DESCRIBE ${table}`);
            console.table(cols);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
