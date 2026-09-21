const db = require('./src/config/mysql');
async function run() {
    const [cols] = await db.query('DESCRIBE attendance');
    console.log(JSON.stringify(cols, null, 2));
    process.exit(0);
}
run();
