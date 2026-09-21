const db = require('./src/config/mysql');
async function run() {
    const [users] = await db.query('SELECT id, name, email, role FROM users');
    const [employees] = await db.query('SELECT id, user_id, employer_id, company_id FROM employees');
    const [attendance] = await db.query('SELECT id, employee_id, date, check_in, check_out FROM attendance');
    console.log('USERS:', JSON.stringify(users));
    console.log('EMPLOYEES:', JSON.stringify(employees));
    console.log('ATTENDANCE:', JSON.stringify(attendance));
    process.exit(0);
}
run();
