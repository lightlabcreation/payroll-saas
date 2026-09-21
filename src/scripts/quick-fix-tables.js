const mysql = require('mysql2/promise');

async function quickFix() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'pop_db'
        });

        console.log("Connected to pop_db");

        // Try simple CREATE
        try {
            await connection.query(`
                CREATE TABLE bill_companies (
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
            console.log("✓ bill_companies created");
        } catch (e) {
            if (e.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log("✓ bill_companies already exists");
            } else {
                throw e;
            }
        }

        // Seed data
        const [rows] = await connection.query("SELECT COUNT(*) as count FROM bill_companies");
        if (rows[0].count === 0) {
            await connection.query(`
                INSERT INTO bill_companies (name, category, billing_code, level, status) VALUES 
                ('HDFC Home Loans', 'Mortgage', 'HDFC001', 'National', 'Active'),
                ('Reliance Jio', 'Utilities', 'JIO999', 'National', 'Active')
            `);
            console.log("✓ Seeded 2 records");
        }

        console.log("✅ Done!");

    } catch (error) {
        console.error("❌ Error:", error.message);
        console.error("Full error:", error);
    } finally {
        if (connection) await connection.end();
    }
}

quickFix();
