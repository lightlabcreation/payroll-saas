const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixAllTables() {
  let connection;
  try {
    console.log("🚀 Starting database schema sync...");
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'pop_db'
    });

    // 1. COMPANIES table
    console.log('🏢 Fixing companies table...');
    await connection.query('DROP TABLE IF EXISTS companies');
    await connection.query(`
            CREATE TABLE companies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                admin_id INT,
                company_name VARCHAR(200) NOT NULL,
                company_logo VARCHAR(255),
                company_address TEXT,
                website VARCHAR(200),
                gst_number VARCHAR(50),
                pan_number VARCHAR(50),
                subscription_plan VARCHAR(50) DEFAULT 'basic',
                status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 2. EMPLOYERS table (Managers/Sub-admins)
    console.log('👤 Fixing employers table...');
    await connection.query('DROP TABLE IF EXISTS employers');
    await connection.query(`
            CREATE TABLE employers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                company_id INT,
                company_name VARCHAR(200),
                company_logo VARCHAR(255),
                company_address TEXT,
                designation VARCHAR(100) DEFAULT 'Manager',
                status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
                created_by INT,
                subscription_plan VARCHAR(50) DEFAULT 'Basic',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 3. EMPLOYEES table
    console.log('👷 Fixing employees table...');
    await connection.query('DROP TABLE IF EXISTS employees');
    await connection.query(`
            CREATE TABLE employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                employer_id INT,
                company_id INT,
                designation VARCHAR(100),
                salary DECIMAL(10, 2) DEFAULT 0,
                credit_balance DECIMAL(10, 2) DEFAULT 0,
                department VARCHAR(100),
                joining_date DATE,
                status VARCHAR(20) DEFAULT 'active',
                emergency_contact VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 4. VENDORS table
    console.log('🚚 Fixing vendors table...');
    await connection.query('DROP TABLE IF EXISTS vendors');
    await connection.query(`
            CREATE TABLE vendors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                company_id INT,
                company_name VARCHAR(200),
                contact_person VARCHAR(100),
                phone VARCHAR(30),
                email VARCHAR(100),
                address TEXT,
                service_type VARCHAR(100),
                salary DECIMAL(10, 2) DEFAULT 0,
                joining_date DATE,
                payment_status VARCHAR(20) DEFAULT 'pending',
                status VARCHAR(20) DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 5. JOBS table
    console.log('📝 Fixing jobs table...');
    await connection.query('DROP TABLE IF EXISTS jobs');
    await connection.query(`
            CREATE TABLE jobs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employer_id INT,
                title VARCHAR(200) NOT NULL,
                location VARCHAR(100),
                employer_type VARCHAR(50) DEFAULT 'Company',
                department VARCHAR(100),
                description TEXT,
                requirements TEXT,
                benefits TEXT,
                job_type VARCHAR(50) DEFAULT 'Full-time',
                salary_min DECIMAL(10, 2),
                salary_max DECIMAL(10, 2),
                experience VARCHAR(50),
                skills TEXT,
                expiry_date DATE,
                status VARCHAR(20) DEFAULT 'Active',
                is_active BOOLEAN DEFAULT TRUE,
                posted_date DATETIME,
                views_count INT DEFAULT 0,
                applicants_count INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 6. JOB_APPLICATIONS table
    console.log('📄 Fixing job_applications table...');
    await connection.query('DROP TABLE IF EXISTS job_applications');
    await connection.query(`
            CREATE TABLE job_applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                jobseeker_id INT,
                job_id INT,
                applicant_name VARCHAR(100),
                email VARCHAR(100),
                phone VARCHAR(20),
                resume VARCHAR(255),
                cover_letter TEXT,
                experience VARCHAR(255),
                education TEXT,
                skills TEXT,
                status VARCHAR(20) DEFAULT 'Under Review',
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 7. ATTENDANCE table
    console.log('⏰ Fixing attendance table...');
    await connection.query('DROP TABLE IF EXISTS attendance');
    await connection.query(`
            CREATE TABLE attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                employee_id INT,
                employer_id INT,
                date DATE NOT NULL,
                check_in DATETIME,
                check_out DATETIME,
                status VARCHAR(20) DEFAULT 'present',
                total_hours DECIMAL(5, 2),
                working_hours DECIMAL(5, 2),
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 8. CREDITS table
    console.log('💳 Fixing credits table...');
    await connection.query('DROP TABLE IF EXISTS credits');
    await connection.query(`
            CREATE TABLE credits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employer_id INT NOT NULL,
                balance DECIMAL(10, 2) DEFAULT 0,
                total_added DECIMAL(10, 2) DEFAULT 0,
                total_used DECIMAL(10, 2) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 9. CREDIT_TRANSACTIONS table
    console.log('📜 Fixing credit_transactions table...');
    await connection.query('DROP TABLE IF EXISTS credit_transactions');
    await connection.query(`
            CREATE TABLE credit_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employer_id INT,
                employee_id INT,
                amount DECIMAL(10, 2) NOT NULL,
                type ENUM('credit', 'debit') NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 10. TRANSACTIONS table
    console.log('💸 Fixing transactions table...');
    await connection.query('DROP TABLE IF EXISTS transactions');
    await connection.query(`
            CREATE TABLE transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                employer_id INT,
                amount DECIMAL(10, 2) NOT NULL,
                type VARCHAR(50) NOT NULL,
                description TEXT,
                beneficiary VARCHAR(100),
                reference VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pending',
                account_number VARCHAR(50),
                payment_method VARCHAR(50),
                date DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 11. PAYMENT_SETUPS table
    console.log('⚙️  Fixing payment_setups table...');
    await connection.query('DROP TABLE IF EXISTS payment_setups');
    await connection.query(`
            CREATE TABLE payment_setups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT,
                provider VARCHAR(50) DEFAULT 'bank_transfer',
                config TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_by INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 12. BILLS table
    console.log('🧾 Fixing bills table...');
    await connection.query('DROP TABLE IF EXISTS bills');
    await connection.query(`
            CREATE TABLE bills (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id INT,
                employer_id INT,
                name VARCHAR(100),
                bill_number VARCHAR(50),
                amount DECIMAL(10, 2) NOT NULL,
                description TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                paid_date DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 13. TRAININGS table
    console.log('🎓 Fixing trainings table...');
    await connection.query('DROP TABLE IF EXISTS training_courses');
    await connection.query(`
            CREATE TABLE training_courses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employer_id INT,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                trainer_name VARCHAR(100),
                start_date DATETIME,
                end_date DATETIME,
                location VARCHAR(200),
                max_participants INT,
                status VARCHAR(20) DEFAULT 'scheduled',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    // 14. TRAINING_ENROLLMENTS table
    console.log('📝 Fixing training_enrollments table...');
    await connection.query('DROP TABLE IF EXISTS training_enrollments');
    await connection.query(`
            CREATE TABLE training_enrollments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                training_id INT,
                employee_id INT,
                status VARCHAR(20) DEFAULT 'enrolled',
                test_status VARCHAR(20) DEFAULT 'pending',
                test_score DECIMAL(5, 2),
                certificate_id VARCHAR(100),
                certificate_url VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=MyISAM
        `);

    console.log("✅ All specified tables fixed and synced successfully!");

  } catch (error) {
    console.error("❌ Error fixing tables:", error);
  } finally {
    if (connection) await connection.end();
    process.exit();
  }
}

fixAllTables();
