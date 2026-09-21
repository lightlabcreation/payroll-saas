
const db = require('../config/mysql');

async function checkJobsSchema() {
    try {
        const [columns] = await db.query('DESCRIBE jobs');
        console.log('\n--- jobs ---');
        console.log(columns.map(c => `${c.Field} (${c.Type})`).join(', '));
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkJobsSchema();
