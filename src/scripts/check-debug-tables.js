
const db = require('../src/config/mysql');

async function checkTables() {
    try {
        console.log('Checking tables...');
        const [tables] = await db.query('SHOW TABLES');
        console.log('Tables:', tables.map(t => Object.values(t)[0]));

        console.log('\nChecking bill_companies schema...');
        try {
            const [columns] = await db.query('DESCRIBE bill_companies');
            console.log('bill_companies columns:', columns.map(c => c.Field));
        } catch (e) {
            console.log('bill_companies table error:', e.message);
        }

        console.log('\nChecking employers schema...');
        try {
            const [columns] = await db.query('DESCRIBE employers');
            console.log('employers columns:', columns.map(c => c.Field));
        } catch (e) {
            console.log('employers table error:', e.message);
        }

        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkTables();
