
const db = require('../config/mysql');

async function fixEmp() {
    try {
        const connection = await db.getConnection();
        const [cols] = await connection.query("SHOW COLUMNS FROM employees LIKE 'employer_id'");
        if (cols.length === 0) {
            console.log("Adding employer_id...");
            await connection.query("ALTER TABLE employees ADD COLUMN employer_id INT AFTER user_id");
            console.log("Added employer_id.");
        } else {
            console.log("employer_id exists.");
        }
        connection.release();
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixEmp();
