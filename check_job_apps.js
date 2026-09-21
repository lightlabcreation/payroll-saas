const db = require('./src/config/mysql');
async function run() {
    const [cols] = await db.query('SHOW COLUMNS FROM job_applications');
    console.log('JOB_APPS:', JSON.stringify(cols.map(c => c.Field)));
    process.exit(0);
}
run();
