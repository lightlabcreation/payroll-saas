const db = require('../config/mysql');

async function inspectUsers() {
    try {
        const [rows] = await db.query('SELECT id, name, email, role, company_id FROM users');
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

inspectUsers();
