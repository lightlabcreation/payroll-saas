
const db = require('../config/mysql');

async function updateJobsTable() {
    try {
        console.log('Checking jobs table columns...');

        const [columns] = await db.query('DESCRIBE jobs');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('department')) {
            console.log('Adding department column...');
            await db.query('ALTER TABLE jobs ADD COLUMN department VARCHAR(100) AFTER title');
        }

        if (!columnNames.includes('employer_type')) {
            console.log('Adding employer_type column...');
            await db.query("ALTER TABLE jobs ADD COLUMN employer_type VARCHAR(50) DEFAULT 'Company' AFTER location");
        }

        console.log('Jobs table updated successfully.');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

updateJobsTable();
