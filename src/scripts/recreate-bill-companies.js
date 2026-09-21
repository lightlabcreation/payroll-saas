
const db = require('../config/mysql');

async function recreateBillCompanies() {
    try {
        console.log('Dropping bill_companies table if exists...');
        try {
            await db.query('DROP TABLE IF EXISTS bill_companies');
        } catch (e) {
            console.log('Drop error (ignorable):', e.message);
        }

        console.log('Creating bill_companies table...');
        const createTableQuery = `
      CREATE TABLE bill_companies (
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
        console.log('bill_companies table recreated successfully.');

        // Check employer table for subscription_plan column
        console.log('Checking employers table for subscription_plan column...');
        try {
            // Try adding it, ignore if duplicate column name
            await db.query("ALTER TABLE employers ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'Basic'");
            console.log('Added subscription_plan column.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('subscription_plan column already exists.');
            } else {
                console.error('Error modifying employers:', e.message);
            }
        }

        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

recreateBillCompanies();
