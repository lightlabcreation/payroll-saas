const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database Initialization Script
 * This script creates all required tables for the payroll system
 */

async function initializeDatabase() {
  let connection;

  try {
    console.log('🔌 Connecting to MySQL...');

    // Create connection without specifying database first
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT, 10) || 3306
    });

    console.log('✅ Connected to MySQL');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'pop_db';
    console.log(`📦 Creating database '${dbName}' if not exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Database '${dbName}' ready`);

    // Switch to the database
    await connection.query(`USE \`${dbName}\``);
    console.log(`✅ Using database '${dbName}'`);

    // Disable foreign key checks temporarily
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    console.log('📝 Creating tables...\n');

    // Create users table
    console.log('Creating users table...');
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

    // Create employers table (Main profile for Employer role)
    console.log('Creating employers table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employers (
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_employer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=MyISAM
    `);
    console.log('✅ employers table created');

    // Create companies table
    console.log('Creating companies table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS companies (
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
    console.log('✅ companies table created');

    // Create employees table
    console.log('Creating employees table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employees (
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_employee_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=MyISAM
    `);
    console.log('✅ employees table created');

    // Create job_seekers table
    console.log('Creating job_seekers table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS job_seekers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        location VARCHAR(100),
        skills TEXT,
        experience TEXT,
        education TEXT,
        current_company VARCHAR(255),
        level VARCHAR(100),
        status ENUM('active', 'inactive', 'blocked') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_js_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=MyISAM
    `);
    console.log('✅ job_seekers table created');

    // Create vendors table
    console.log('Creating vendors table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendors (
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_vendor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=MyISAM
    `);
    console.log('✅ vendors table created');

    // Create jobs table
    console.log('Creating jobs table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS jobs (
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
    console.log('✅ jobs table created');

    // Create job_applications table
    console.log('Creating job_applications table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS job_applications (
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
    console.log('✅ job_applications table created');

    // Create attendance table
    console.log('Creating attendance table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance (
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
    console.log('✅ attendance table created');

    // Create credits table
    console.log('Creating credits table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employer_id INT NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 0,
        total_added DECIMAL(10, 2) DEFAULT 0,
        total_used DECIMAL(10, 2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=MyISAM
    `);
    console.log('✅ credits table created');

    // Create transactions table
    console.log('Creating transactions table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS transactions (
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
    console.log('✅ transactions table created');

    // Create training_courses table
    console.log('Creating training_courses table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS training_courses (
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
    console.log('✅ training_courses table created');

    // Create training_enrollments table
    console.log('Creating training_enrollments table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS training_enrollments (
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
    console.log('✅ training_enrollments table created');

    // Create bank_details table
    console.log('Creating bank_details table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_details (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        employer_id INT,
        bank_name VARCHAR(100),
        account_number VARCHAR(50),
        ifsc_code VARCHAR(20),
        account_holder_name VARCHAR(100),
        branch_name VARCHAR(100),
        account_type VARCHAR(50) DEFAULT 'Savings',
        is_primary BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'active',
        verification_status VARCHAR(20) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=MyISAM
    `);
    console.log('✅ bank_details table created');

    // Create salary_records table
    console.log('Creating salary_records table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS salary_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        employer_id INT,
        month VARCHAR(20),
        year INT,
        amount DECIMAL(10, 2),
        basic_salary DECIMAL(10, 2),
        gross_salary DECIMAL(10, 2),
        net_salary DECIMAL(10, 2),
        pf DECIMAL(10, 2) DEFAULT 0,
        tds DECIMAL(10, 2) DEFAULT 0,
        professional_tax DECIMAL(10, 2) DEFAULT 0,
        status ENUM('pending', 'paid') DEFAULT 'pending',
        payment_date DATETIME,
        payment_method VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=MyISAM
    `);
    console.log('✅ salary_records table created');

    // Create job portal specialized tables
    console.log('Creating job seeker specialized tables...');
    await connection.query(`
       CREATE TABLE IF NOT EXISTS job_seeker_profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          professional_summary TEXT,
          job_industry VARCHAR(100),
          preferred_location VARCHAR(100),
          visibility ENUM('public', 'hidden', 'visible') DEFAULT 'public',
          salary_expectation VARCHAR(100),
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=MyISAM;
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS resumes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          file_path VARCHAR(255) NOT NULL,
          title VARCHAR(255),
          resume_data TEXT,
          is_default BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=MyISAM;
    `);
    console.log('✅ Job Portal tables created');

    // Create audit_logs table
    console.log('Creating audit_logs table...');
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

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // Verify tables were created
    const [tables] = await connection.query('SHOW TABLES');
    console.log('\n📊 Tables in database:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   ✓ ${tableName}`);
    });

    console.log('\n🎉 Database initialization completed successfully!');

  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the initialization
initializeDatabase();
