
const db = require('../config/mysql');

async function checkSchemas() {
    try {
        const tables = ['credits', 'transactions', 'attendance', 'job_vacancies', 'training_courses', 'employees', 'vendors'];
        for (const table of tables) {
            try {
                const [columns] = await db.query(`DESCRIBE ${table}`);
                console.log(`\n--- ${table} ---`);
                console.log(columns.map(c => `${c.Field} (${c.Type})`).join(', '));
            } catch (e) {
                console.log(`\n--- ${table} --- DOES NOT EXIST or Error: ${e.message}`);
            }
        }
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkSchemas();
