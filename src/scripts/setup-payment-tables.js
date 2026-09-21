const mysql = require('mysql2/promise');

async function setupPaymentTables() {
    let connection;
    try {
        console.log("Connecting to DB (pop_db)...");
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'pop_db'
        });

        console.log("Creating table 'payment_gateways'...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS payment_gateways (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                api_key VARCHAR(255),
                webhook_url VARCHAR(255),
                transaction_fee VARCHAR(50),
                supported_methods JSON,
                status VARCHAR(50) DEFAULT 'Active',
                logo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Creating table 'company_bank_accounts'...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS company_bank_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bank_name VARCHAR(255) NOT NULL,
                account_holder VARCHAR(255),
                account_number VARCHAR(255),
                ifsc_code VARCHAR(50),
                branch VARCHAR(255),
                transaction_limit VARCHAR(100),
                processing_time VARCHAR(100),
                status VARCHAR(50) DEFAULT 'Pending Verification',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Tables created/verified.");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        if (connection) await connection.end();
    }
}

setupPaymentTables();
