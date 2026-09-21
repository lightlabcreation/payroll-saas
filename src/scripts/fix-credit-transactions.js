
const db = require('../config/mysql');
const fs = require('fs');

async function fix() {
    try {
        console.log("Checking credit_transactions schema...");
        const [cols] = await db.query("SHOW COLUMNS FROM credit_transactions LIKE 'is_deleted'");
        if (cols.length === 0) {
            console.log("is_deleted missing. Adding it...");
            // BOOLEAN or TINYINT(1) DEFAULT 0
            await db.query("ALTER TABLE credit_transactions ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE");
            console.log("Added is_deleted.");
        } else {
            console.log("is_deleted exists.");
        }

        // Find getCreditBalance line
        const content = fs.readFileSync('src/controllers/employer.controller.js', 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (line.includes('const getCreditBalance')) {
                console.log(`getCreditBalance found at line ${i + 1}`);
            }
        });

        db.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
