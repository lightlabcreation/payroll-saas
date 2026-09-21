const mysql = require('mysql2/promise');

async function setupAllTables() {
    let connection;
    try {
        console.log("Connecting to DB (pop_db)...");
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'pop_db'
        });

        // Bill Companies Table
        console.log("Creating bill_companies table...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS bill_companies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                billing_code VARCHAR(100),
                level VARCHAR(50) DEFAULT 'National',
                status VARCHAR(50) DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("✓ bill_companies table created");

        // Check and seed bill_companies
        const [billRows] = await connection.query("SELECT COUNT(*) as count FROM bill_companies");
        if (billRows[0].count === 0) {
            await connection.query(`
                INSERT INTO bill_companies (name, category, billing_code, level, status) VALUES 
                ('HDFC Home Loans', 'Mortgage', 'HDFC001', 'National', 'Active'),
                ('Reliance Jio', 'Utilities', 'JIO999', 'National', 'Active')
            `);
            console.log("✓ bill_companies seeded");
        }

        console.log("\n✅ All tables setup complete!");

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        if (connection) await connection.end();
    }
}

setupAllTables();
