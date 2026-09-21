const db = require('./src/config/mysql');
async function run() {
    const [attendance] = await db.query('SELECT * FROM attendance LIMIT 5');
    console.log('Raw Attendance Data:');
    attendance.forEach(a => {
        console.log(`ID: ${a.id}, Date: ${a.date} (Type: ${typeof a.date}), CheckIn: ${a.check_in} (Type: ${typeof a.check_in})`);
    });
    process.exit(0);
}
run();
