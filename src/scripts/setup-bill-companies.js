const mysql = require('mysql2/promise');

async function setupBillCompanies() {
    let connection;
    try {
        console.log("Connecting to DB (pop_db)...");
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'pop_db'
        });


        console.log("Creating table 'bill_companies'...");
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
            )
        `);

        console.log("Table created/verified.");

        // Check if empty
        const [rows] = await connection.query("SELECT COUNT(*) as count FROM bill_companies");
        if (rows[0].count === 0) {
            console.log("Seeding initial data...");
            await connection.query(`
                INSERT INTO bill_companies (name, category, billing_code, level, status) VALUES 
                ('HDFC Home Loans', 'Mortgage', 'HDFC001', 'National', 'Active'),
                ('Reliance Jio', 'Utilities', 'JIO999', 'National', 'Active')
            `);
            console.log("Seeded.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        if (connection) await connection.end();
    }
}

setupBillCompanies();
