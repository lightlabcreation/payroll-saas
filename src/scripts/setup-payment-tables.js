const db = require('../config/mysql');

async function setupPaymentTables() {
    try {
        console.log("Creating/Verifying table 'payment_gateways'...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS payment_gateways (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT,
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

        try {
            await db.query(`ALTER TABLE payment_gateways ADD COLUMN company_id INT AFTER id`);
        } catch (e) {
            // Column may already exist
        }

        console.log("Creating/Verifying table 'company_bank_accounts'...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS company_bank_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT,
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

        try {
            await db.query(`ALTER TABLE company_bank_accounts ADD COLUMN company_id INT AFTER id`);
        } catch (e) {
            // Column may already exist
        }

        console.log("Tables created/verified successfully.");
    } catch (error) {
        console.error("Error setting up payment tables:", error);
    }
}

setupPaymentTables();
