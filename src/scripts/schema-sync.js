const mysql = require('mysql2/promise');
require('dotenv').config();

async function syncSchema() {
    let connection;
    try {
        console.log("🚀 Starting database schema sync (Safe Mode)...");
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        const tables = {
            jobs: {
                location: 'VARCHAR(100)',
                employer_type: 'VARCHAR(50) DEFAULT "Company"',
                department: 'VARCHAR(100)',
                requirements: 'TEXT',
                benefits: 'TEXT',
                job_type: 'VARCHAR(50) DEFAULT "Full-time"',
                salary_min: 'DECIMAL(10, 2)',
                salary_max: 'DECIMAL(10, 2)',
                experience: 'VARCHAR(50)',
                skills: 'TEXT',
                expiry_date: 'DATE',
                is_active: 'BOOLEAN DEFAULT TRUE',
                posted_date: 'DATETIME',
                views_count: 'INT DEFAULT 0',
                applicants_count: 'INT DEFAULT 0'
            },
            job_applications: {
                jobseeker_id: 'INT',
                phone: 'VARCHAR(20)',
                resume: 'VARCHAR(255)',
                cover_letter: 'TEXT',
                experience: 'VARCHAR(255)',
                education: 'TEXT',
                skills: 'TEXT',
                applied_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
            },
            employers: {
                company_logo: 'VARCHAR(255)',
                company_address: 'TEXT',
                designation: 'VARCHAR(100) DEFAULT "Manager"',
                subscription_plan: 'VARCHAR(50) DEFAULT "Basic"'
            },
            companies: {
                company_logo: 'VARCHAR(255)',
                subscription_plan: 'VARCHAR(50) DEFAULT "basic"'
            },
            employees: {
                company_id: 'INT',
                credit_balance: 'DECIMAL(10, 2) DEFAULT 0',
                emergency_contact: 'VARCHAR(100)'
            },
            vendors: {
                company_id: 'INT',
                company_name: 'VARCHAR(200)',
                contact_person: 'VARCHAR(100)',
                service_type: 'VARCHAR(100)',
                salary: 'DECIMAL(10, 2) DEFAULT 0',
                joining_date: 'DATE',
                payment_status: 'VARCHAR(20) DEFAULT "pending"'
            },
            attendance: {
                user_id: 'INT',
                employer_id: 'INT',
                total_hours: 'DECIMAL(5, 2)',
                working_hours: 'DECIMAL(5, 2)',
                notes: 'TEXT'
            },
            transactions: {
                transaction_id: 'VARCHAR(100)',
                payment_method: 'VARCHAR(50)',
                description: 'TEXT'
            },
            job_seeker_profiles: {
                user_id: 'INT',
                skills: 'TEXT',
                experience: 'VARCHAR(100)',
                education: 'VARCHAR(200)',
                current_company: 'VARCHAR(150)',
                level: 'VARCHAR(50)',
                resume_url: 'VARCHAR(255)'
            },
            training_courses: {
                trainer_name: 'VARCHAR(100)',
                duration: 'VARCHAR(50)',
                category: 'VARCHAR(50)'
            }
        };

        for (const [tableName, columns] of Object.entries(tables)) {
            console.log(`Checking table: ${tableName}`);
            try {
                const [cols] = await connection.query(`SHOW COLUMNS FROM ${tableName}`);
                const existingFields = cols.map(c => c.Field);

                for (const [col, type] of Object.entries(columns)) {
                    if (!existingFields.includes(col)) {
                        console.log(`➕ Adding column [${col}] to [${tableName}]`);
                        await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${col} ${type}`);
                    }
                }
            } catch (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`⚠️  Table ${tableName} does not exist. Skipping safe sync for it.`);
                } else {
                    console.error(`❌ Error checking table ${tableName}:`, err.message);
                }
            }
        }

        console.log("✅ Schema sync complete!");

    } catch (error) {
        console.error("❌ Fatal Error:", error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

syncSchema();
