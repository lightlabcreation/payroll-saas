
const db = require('../config/mysql');

async function fixBillCompanies() {
    try {
        console.log('Checking bill_companies table...');

        // Create bill_companies table if not exists
        const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_companies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        billing_code VARCHAR(50),
        level VARCHAR(50),
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

        await db.query(createTableQuery);
        console.log('bill_companies table checked/created.');

        // Check employer table for subscription_plan column
        console.log('Checking employers table for subscription_plan column...');
        try {
            const [cols] = await db.query("SHOW COLUMNS FROM employers LIKE 'subscription_plan'");
            if (cols.length === 0) {
                console.log('Adding subscription_plan column to employers...');
                await db.query("ALTER TABLE employers ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'Basic'");
            } else {
                console.log('subscription_plan column exists.');
            }
        } catch (e) {
            console.error('Error checking employers:', e.message);
        }

        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixBillCompanies();
