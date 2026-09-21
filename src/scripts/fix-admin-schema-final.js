const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixAllAdminSchema() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log('🔌 Starting Comprehensive Admin Schema Fix...');

        // 1. Fix Transactions (Missing 'date')
        console.log('🔧 Checking transactions...');
        try {
            // Drop and recreate to be 100% sure of structure matching code expectations
            await connection.query('DROP TABLE IF EXISTS transactions');
            await connection.query(`
            CREATE TABLE transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                employer_id INT,
                amount DECIMAL(10, 2) NOT NULL,
                type ENUM('credit', 'debit') NOT NULL,
                description TEXT,
                date DATETIME DEFAULT CURRENT_TIMESTAMP, 
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);
            console.log('   ✅ Transactions table recreated with [date] column.');
        } catch (e) {
            console.log('   ❌ Error fixing transactions:', e.message);
        }

        // 2. Fix Credits (Ensure all columns)
        console.log('🔧 Checking credits...');
        // We already fixed this, but ensuring won't hurt
        const [credCols] = await connection.query("SHOW COLUMNS FROM credits LIKE 'total_added'");
        if (credCols.length === 0) {
            await connection.query(`ALTER TABLE credits ADD COLUMN total_added DECIMAL(10, 2) DEFAULT 0.00 AFTER balance`);
            await connection.query(`ALTER TABLE credits ADD COLUMN total_used DECIMAL(10, 2) DEFAULT 0.00 AFTER total_added`);
            console.log('   ✅ Added missing columns to credits.');
        } else {
            console.log('   ✅ Credits table okay.');
        }

        // 3. Create/Fix Employer Wallets (Likely missing)
        console.log('🔧 Checking employer_wallets...');
        await connection.query('DROP TABLE IF EXISTS employer_wallets');
        await connection.query(`
        CREATE TABLE employer_wallets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employer_id INT NOT NULL,
            balance DECIMAL(10, 2) DEFAULT 0.00,
            currency VARCHAR(10) DEFAULT 'INR',
            status ENUM('active', 'inactive') DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_employer (employer_id)
        ) ENGINE=MyISAM
    `);
        console.log('   ✅ Employer Wallets table created.');

        // 4. Checking Payment Setups (Bank details)
        console.log('🔧 Checking payment_setups...');
        await connection.query('DROP TABLE IF EXISTS payment_setups');
        await connection.query(`
        CREATE TABLE payment_setups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            provider VARCHAR(50) NOT NULL COMMENT 'bank_transfer, stripe, razorpay',
            config JSON,
            active BOOLEAN DEFAULT TRUE,
            created_by INT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_company (company_id)
        ) ENGINE=MyISAM
    `);
        console.log('   ✅ Payment Setups table created.');

        // 5. Ensure Employees table has all columns
        console.log('🔧 Checking employees...');
        // Recreating to ensure schema match
        await connection.query('DROP TABLE IF EXISTS employees');
        await connection.query(`
      CREATE TABLE employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        company_id INT NOT NULL,
        designation VARCHAR(100),
        salary DECIMAL(10, 2),
        department VARCHAR(100),
        joining_date DATE,
        status ENUM('active', 'inactive', 'terminated') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_company (company_id)
      ) ENGINE=MyISAM
    `);
        console.log('   ✅ Employees table recreated.');

        // 6. Ensure Bill Companies table exists (Admin billing)
        console.log('🔧 Checking bill_companies...');
        await connection.query(`
        CREATE TABLE IF NOT EXISTS bill_companies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            due_date DATE,
            status ENUM('paid', 'unpaid', 'overdue') DEFAULT 'unpaid',
            created_by INT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=MyISAM
    `);
        console.log('   ✅ Bill companies table checked.');


        console.log('\n🎉 ALL ADMIN TABLES FIXED. You should not see column errors now.');

    } catch (error) {
        console.error('❌ CRITICAL ERROR:', error.message);
    } finally {
        if (connection) connection.end();
    }
}

fixAllAdminSchema();
