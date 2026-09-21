
const db = require('../config/mysql');

async function checkSchema() {
    try {
        const tables = ['employees', 'jobs', 'trainings', 'employers'];

        for (const table of tables) {
            console.log(`\n--- Schema for ${table} ---`);
            try {
                const [rows] = await db.query(`DESCRIBE ${table}`);
                rows.forEach(row => {
                    console.log(`${row.Field}: ${row.Type} (Key: ${row.Key})`);
                });
            } catch (err) {
                console.log(`Error describing ${table}: ${err.message}`);
            }
        }
        process.exit();
    } catch (error) {
        console.error('Script error:', error);
        process.exit(1);
    }
}

checkSchema();
