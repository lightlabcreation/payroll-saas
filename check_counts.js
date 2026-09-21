const db = require('./src/config/mysql');
async function run() {
    const [counts] = await db.query('SELECT role, COUNT(*) as count FROM users GROUP BY role');
    console.log('COUNTS:', JSON.stringify(counts));
    process.exit(0);
}
run();
