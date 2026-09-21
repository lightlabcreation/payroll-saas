
const db = require('../config/mysql');

async function addAttendanceNotes() {
    try {
        console.log('Checking attendance table columns...');

        const [columns] = await db.query('DESCRIBE attendance');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('notes')) {
            console.log('Adding notes column...');
            await db.query("ALTER TABLE attendance ADD COLUMN notes TEXT AFTER status");
        }

        console.log('Attendance table schema updated.');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

addAttendanceNotes();
