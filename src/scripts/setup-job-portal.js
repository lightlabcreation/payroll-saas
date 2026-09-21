const mysql = require('mysql2/promise');

async function setupJobPortalTables() {
    let connection;
    try {
        console.log("Connecting to DB (pop_db)...");
        connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'pop_db'
        });

        console.log("Creating table 'job_vacancies'...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS job_vacancies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                department VARCHAR(255),
                location VARCHAR(255),
                description TEXT,
                salary_min DECIMAL(10,2),
                salary_max DECIMAL(10,2),
                employer_name VARCHAR(255) DEFAULT 'Internal',
                job_type VARCHAR(100),
                experience_required VARCHAR(100),
                expiry_date DATE,
                skills TEXT,
                level VARCHAR(100),
                status VARCHAR(50) DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Creating table 'job_seekers'...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS job_seekers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                skills TEXT,
                experience VARCHAR(255),
                education VARCHAR(255),
                current_company VARCHAR(255),
                level VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("Creating table 'job_applications'...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS job_applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vacancy_id INT,
                job_seeker_id INT,
                status VARCHAR(50) DEFAULT 'Applied',
                applied_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vacancy_id) REFERENCES job_vacancies(id) ON DELETE CASCADE,
                FOREIGN KEY (job_seeker_id) REFERENCES job_seekers(id) ON DELETE CASCADE
            )
        `);

        console.log("Tables created/verified.");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        if (connection) await connection.end();
    }
}

setupJobPortalTables();
