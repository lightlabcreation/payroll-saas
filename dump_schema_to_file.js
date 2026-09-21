const db = require('./src/config/mysql');
const fs = require('fs');
async function run() {
    let output = '';
    const log = (msg) => { output += msg + '\n'; console.log(msg); };
    try {
        log('--- TABLES ---');
        const [tables] = await db.query('SHOW TABLES');
        log(JSON.stringify(tables.map(t => Object.values(t)[0])));

        const targetTables = ['users', 'employers', 'companies', 'employees', 'vendors', 'transactions', 'jobs', 'job_applications', 'credits'];
        for (const table of targetTables) {
            log(`\n--- SCHEMA: ${table} ---`);
            const [cols] = await db.query(`DESCRIBE ${table}`);
            log(JSON.stringify(cols));
        }
    } catch (e) {
        log(e.stack);
    }
    fs.writeFileSync('schema_dump.json', output);
    process.exit(0);
}
run();
