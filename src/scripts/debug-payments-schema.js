
const db = require('../config/mysql');

async function checkTables() {
    try {
        const tables = ['payments', 'companies', 'users', 'invoices', 'plans'];
        for (const table of tables) {
            try {
                const [columns] = await db.query(`DESCRIBE ${table}`);
                console.log(`\nTable: ${table}`);
                columns.forEach(col => console.log(`${col.Field} (${col.Type})`));
            } catch (err) {
                console.error(`Error describing ${table}:`, err.message);
            }
        }
    } catch (error) {
        console.error('General error:', error);
    } finally {
        process.exit();
    }
}

checkTables();
