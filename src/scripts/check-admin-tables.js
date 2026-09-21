
const db = require('../config/mysql');

async function checkTables() {
    try {
        const tableNames = ['companies', 'employers'];
        for (const table of tableNames) {
            try {
                const [columns] = await db.query(`DESCRIBE ${table}`);
                console.log(`\nTable: ${table}`);
                columns.forEach(col => console.log(`${col.Field} (${col.Type})`));
            } catch (err) {
                console.log(`\nTable ${table} does not exist or error: ${err.message}`);
            }
        }
    } catch (error) {
        console.error('General error:', error);
    } finally {
        process.exit();
    }
}

checkTables();
