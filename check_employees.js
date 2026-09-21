const db = require('./src/config/mysql');
async function run() {
    const [employees] = await db.query('SELECT * FROM employees');
    console.log('EMPLOYEES:', JSON.stringify(employees));
    process.exit(0);
}
run();
