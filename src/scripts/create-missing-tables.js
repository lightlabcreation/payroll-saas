const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function createMissingTables() {
    let connection;

    try {
        console.log('🔌 Connecting to MySQL...');

        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: parseInt(process.env.DB_PORT, 10) || 3306,
            database: process.env.DB_NAME || 'pop_db'
        });

        console.log('✅ Connected to database');

        // Disable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        // Create users table
        console.log('\n📝 Creating users table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        phone VARCHAR(30),
        password VARCHAR(255) NOT NULL,
        role ENUM('superadmin', 'admin', 'employer', 'employee', 'vendor', 'jobseeker') NOT NULL DEFAULT 'jobseeker',
        company_id INT,
        status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
        last_login DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      )
    `);
        console.log('✅ users table created');

        // Create employers table
        console.log('📝 Creating employers table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS employers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        company_name VARCHAR(200) NOT NULL,
        company_address TEXT,
        website VARCHAR(200),
        gst_number VARCHAR(50),
        pan_number VARCHAR(50),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ employers table created');

        // Add foreign keys
        console.log('📝 Adding foreign keys...');
        try {
            await connection.query(`
        ALTER TABLE employers 
        ADD CONSTRAINT fk_employer_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_employer_user:', err.message);
        }

        try {
            await connection.query(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_user_company 
        FOREIGN KEY (company_id) REFERENCES employers(id) ON DELETE SET NULL
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_user_company:', err.message);
        }
        console.log('✅ Foreign keys added');

        // Create admins table
        console.log('📝 Creating admins table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        department VARCHAR(100),
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        try {
            await connection.query(`
        ALTER TABLE admins 
        ADD CONSTRAINT fk_admin_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_admin_user:', err.message);
        }

        try {
            await connection.query(`
        ALTER TABLE admins 
        ADD CONSTRAINT fk_admin_creator 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_admin_creator:', err.message);
        }
        console.log('✅ admins table created');

        // Create plans table
        console.log('📝 Creating plans table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        duration_months INT NOT NULL DEFAULT 1,
        description TEXT,
        features TEXT,
        max_employees INT,
        max_jobs INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ plans table created');

        // Create company_requests table
        console.log('📝 Creating company_requests table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS company_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL,
        contact_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        phone VARCHAR(30),
        plan_id INT NOT NULL,
        payment_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
        request_status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
        company_address TEXT,
        gst_number VARCHAR(50),
        pan_number VARCHAR(50),
        notes TEXT,
        processed_by INT,
        processed_at DATETIME,
        created_company_id INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        try {
            await connection.query(`
        ALTER TABLE company_requests 
        ADD CONSTRAINT fk_req_plan 
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_req_plan:', err.message);
        }

        try {
            await connection.query(`
        ALTER TABLE company_requests 
        ADD CONSTRAINT fk_req_processor 
        FOREIGN KEY (processed_by) REFERENCES users(id)
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_req_processor:', err.message);
        }

        try {
            await connection.query(`
        ALTER TABLE company_requests 
        ADD CONSTRAINT fk_req_company 
        FOREIGN KEY (created_company_id) REFERENCES employers(id)
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_req_company:', err.message);
        }
        console.log('✅ company_requests table created');

        // Create subscriptions table
        console.log('📝 Creating subscriptions table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employer_id INT NOT NULL,
        plan_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status ENUM('active', 'expired', 'cancelled', 'pending') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        try {
            await connection.query(`
        ALTER TABLE subscriptions 
        ADD CONSTRAINT fk_sub_employer 
        FOREIGN KEY (employer_id) REFERENCES employers(id)
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_sub_employer:', err.message);
        }

        try {
            await connection.query(`
        ALTER TABLE subscriptions 
        ADD CONSTRAINT fk_sub_plan 
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      `);
        } catch (err) {
            if (err.code !== 'ER_DUP_KEYNAME') console.log('⚠️  FK fk_sub_plan:', err.message);
        }
        console.log('✅ subscriptions table created');

        // Create audit_logs table
        console.log('📝 Creating audit_logs table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('✅ audit_logs table created');

        // Enable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        // Insert sample plans
        console.log('\n📊 Inserting sample plans...');
        const [existingPlans] = await connection.query('SELECT COUNT(*) as count FROM plans');
        if (existingPlans[0].count === 0) {
            await connection.query(`
        INSERT INTO plans (name, price, duration_months, description, features, max_employees, max_jobs, is_active) VALUES
        ('Basic', 999.00, 1, 'Perfect for small businesses', '["Basic payroll", "Up to 10 employees", "Email support"]', 10, 5, TRUE),
        ('Professional', 2999.00, 1, 'For growing companies', '["Advanced payroll", "Up to 50 employees", "Priority support", "Reports"]', 50, 20, TRUE),
        ('Enterprise', 9999.00, 1, 'For large organizations', '["Full payroll suite", "Unlimited employees", "24/7 support", "Custom reports", "API access"]', NULL, NULL, TRUE)
      `);
            console.log('✅ Plans inserted');
        } else {
            console.log('⚠️  Plans already exist, skipping');
        }

        // Create superadmin user
        console.log('\n👤 Creating superadmin user...');
        const [existingAdmin] = await connection.query('SELECT COUNT(*) as count FROM users WHERE email = ?', ['superadmin@gmail.com']);

        if (existingAdmin[0].count === 0) {
            const password = 'Admin@123';
            const hashedPassword = await bcrypt.hash(password, 10);

            await connection.query(`
        INSERT INTO users (name, email, phone, password, role, status) VALUES
        ('Super Admin', 'superadmin@gmail.com', '9999999999', ?, 'superadmin', 'active')
      `, [hashedPassword]);

            console.log('✅ Superadmin created');
            console.log('   📧 Email: superadmin@gmail.com');
            console.log('   🔑 Password: Admin@123');
        } else {
            console.log('⚠️  Superadmin already exists');
            console.log('   📧 Email: superadmin@gmail.com');
            console.log('   🔑 Password: Admin@123');
        }

        // Show all tables
        const [tables] = await connection.query('SHOW TABLES');
        console.log('\n📊 All tables in database:');
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`   ✓ ${tableName}`);
        });

        console.log('\n🎉 Database setup completed successfully!');
        console.log('\n🚀 You can now login with:');
        console.log('   📧 Email: superadmin@gmail.com');
        console.log('   🔑 Password: Admin@123');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.sql) console.error('SQL:', error.sql);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Connection closed');
        }
    }
}

createMissingTables();
