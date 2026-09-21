const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTable() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log("--- course_assignments ---");
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM course_assignments");
            cols.forEach(c => console.log(`${c.Field} (${c.Type})`));
        } catch (e) { console.log("course_assignments not found"); }

        console.log("\n--- training_enrollments ---");
        try {
            const [cols2] = await connection.query("SHOW COLUMNS FROM training_enrollments");
            cols2.forEach(c => console.log(`${c.Field} (${c.Type})`));
        } catch (e) { console.log("training_enrollments not found"); }

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

checkTable();
