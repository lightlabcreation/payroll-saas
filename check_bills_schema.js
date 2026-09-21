const db = require('./src/config/mysql');
async function run() {
    const [cols] = await db.query('DESCRIBE bills');
    console.log(JSON.stringify(cols));
    process.exit(0);
}
run();
