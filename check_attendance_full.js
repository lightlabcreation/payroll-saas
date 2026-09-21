const db = require('./src/config/mysql');
async function run() {
    const [cols] = await db.query('DESCRIBE attendance');
    console.log('ATTENDANCE:', JSON.stringify(cols));
    process.exit(0);
}
run();
