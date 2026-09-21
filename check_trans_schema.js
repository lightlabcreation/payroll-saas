const db = require('./src/config/mysql');
async function run() {
    const [cols] = await db.query('DESCRIBE transactions');
    console.log('TRANS_COLS:', JSON.stringify(cols));
    process.exit(0);
}
run();
