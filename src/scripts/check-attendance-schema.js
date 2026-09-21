
const db = require('../config/mysql');

async function checkAttendanceSchema() {
    try {
        const [columns] = await db.query('DESCRIBE attendance');
        console.log('\n--- attendance ---');
        console.log(columns.map(c => `${c.Field} (${c.Type})`).join(', '));
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkAttendanceSchema();
