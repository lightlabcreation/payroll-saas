
const db = require('../config/mysql');

async function fixJobsTable() {
    try {
        console.log('Checking jobs table columns...');

        // Get current columns
        const [columns] = await db.query('DESCRIBE jobs');
        const columnNames = columns.map(c => c.Field);
        console.log('Current columns:', columnNames.join(', '));

        // Add location if missing
        if (!columnNames.includes('location')) {
            console.log('Adding location column...');
            await db.query('ALTER TABLE jobs ADD COLUMN location VARCHAR(100) AFTER title');
        }

        // Add department if missing
        if (!columnNames.includes('department')) {
            console.log('Adding department column...');
            await db.query('ALTER TABLE jobs ADD COLUMN department VARCHAR(100) AFTER title');
        }

        // Add employer_type if missing
        if (!columnNames.includes('employer_type')) {
            console.log('Adding employer_type column...');
            await db.query("ALTER TABLE jobs ADD COLUMN employer_type VARCHAR(50) DEFAULT 'Company' AFTER location");
        }

        console.log('Jobs table schema fixed.');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixJobsTable();
