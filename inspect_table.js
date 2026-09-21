const db = require('./src/config/mysql');
async function run() {
    const table = process.argv[2];
    if (!table) {
        console.error('Provide table name');
        process.exit(1);
    }
    try {
        const [rows] = await db.query(`SELECT * FROM ${table}`);
        console.log(`TABLE ${table}:`, JSON.stringify(rows));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
