const mysql = require('mysql2/promise');

async function checkCredits() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'pop_db'
        });

        console.log("✅ Connected to pop_db\n");

        // Check credits table
        console.log("📊 CREDITS TABLE:");
        console.log("=".repeat(80));
        const [credits] = await connection.query('SELECT * FROM credits');
        console.table(credits);

        // Summary
        const [summary] = await connection.query(`
            SELECT 
                COUNT(*) as total_records,
                SUM(total_added) as total_credits_added,
                SUM(balance) as total_balance,
                SUM(total_added - balance) as total_used
            FROM credits
        `);

        console.log("\n📈 SUMMARY:");
        console.log("=".repeat(80));
        console.log(`Total Records: ${summary[0].total_records}`);
        console.log(`Total Credits Added: ₹${parseFloat(summary[0].total_credits_added || 0).toLocaleString('en-IN')}`);
        console.log(`Total Balance: ₹${parseFloat(summary[0].total_balance || 0).toLocaleString('en-IN')}`);
        console.log(`Total Used: ₹${parseFloat(summary[0].total_used || 0).toLocaleString('en-IN')}`);

        // Check transactions
        console.log("\n\n💳 RECENT TRANSACTIONS (Credit Type):");
        console.log("=".repeat(80));
        const [txns] = await connection.query(`
            SELECT * FROM transactions 
            WHERE type = 'credit'
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        console.table(txns);

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        if (connection) await connection.end();
    }
}

checkCredits();
