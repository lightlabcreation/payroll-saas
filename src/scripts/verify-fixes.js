
const db = require('../config/mysql');

async function verify() {
    try {
        console.log("Verifying tables...");

        // 1. Credit Transactions
        await db.query("SELECT COUNT(*) FROM credit_transactions WHERE is_deleted = 0");
        console.log("✅ credit_transactions (is_deleted) query OK");

        // 2. Employees (check employer_id)
        await db.query("SELECT COUNT(employer_id) FROM employees");
        console.log("✅ employees (employer_id) query OK");

        // 3. Training Courses
        await db.query("SELECT COUNT(*) FROM training_courses");
        console.log("✅ training_courses query OK");

        // 4. Jobs (check employer_id)
        await db.query("SELECT COUNT(employer_id) FROM jobs");
        console.log("✅ jobs (employer_id) query OK");

        const [empRows] = await db.query("SELECT * FROM employers LIMIT 1");
        if (empRows.length > 0) {
            console.log("✅ employers table has data");
        } else {
            console.log("⚠️ employers table is empty (might affect functional tests)");
        }

        process.exit(0);
    } catch (err) {
        console.error("❌ Verification Failed:", err.message);
        process.exit(1);
    }
}

verify();
