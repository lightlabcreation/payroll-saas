const mysql = require('mysql2/promise');
const env = require('./src/config/env');

async function run() {
    try {
        const pool = mysql.createPool({
            host: env.db.host,
            user: env.db.user,
            password: env.db.password,
            database: env.db.name
        });

        const tables = ['salary_records', 'bills', 'bank_details', 'employees'];
        for (const table of tables) {
            console.log(`\nColumns in ${table}:`);
            try {
                const [rows] = await pool.query(`DESCRIBE ${table}`);
                rows.forEach(r => console.log('- ' + r.Field));
            } catch (e) {
                console.log(`Error describing ${table}: ${e.message}`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
