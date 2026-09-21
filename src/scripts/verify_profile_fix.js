const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pop_db'
        });

        const userId = 36; // The "job" user

        console.log('--- Simulating updateProfile ---');
        const updateData = {
            summary: 'Experienced developer with focus on React.',
            skills: ['React', 'NodeJS', 'MySQL'],
            experience: [
                { title: 'Senior Dev', company: 'Tech Inc', duration: '2020-2023', description: 'Lead team' },
                { title: 'Junior Dev', company: 'StartUp', duration: '2018-2020', description: 'Coded stuff' }
            ],
            education: [
                { institution: 'MIT', degree: 'MS CS', duration: '2016-2018' }
            ],
            industry: 'IT',
            location: 'Remote',
            salary_expectation: '150000'
        };

        // We'll call the logic directly since we're in a script
        // 1. Get Job Seeker ID
        let [jsRows] = await connection.query('SELECT id FROM job_seekers WHERE user_id = ?', [userId]);
        const jobSeekerId = jsRows[0].id;

        // 2. Update job_seekers
        await connection.query(`
            UPDATE job_seekers 
            SET skills = ?, location = ?
            WHERE user_id = ?
        `, [updateData.skills.join(','), updateData.location, userId]);

        // 3. Update job_seeker_profiles
        await connection.query(`
            UPDATE job_seeker_profiles 
            SET professional_summary = ?, job_industry = ?, preferred_location = ?, salary_expectation = ?
            WHERE user_id = ?
        `, [updateData.summary, updateData.industry, updateData.location, updateData.salary_expectation, userId]);

        // 4. Update experience
        await connection.query('DELETE FROM job_seeker_experience WHERE job_seeker_id = ?', [jobSeekerId]);
        for (const exp of updateData.experience) {
            await connection.query(`
                INSERT INTO job_seeker_experience (job_seeker_id, job_title, company_name, duration, description)
                VALUES (?, ?, ?, ?, ?)
            `, [jobSeekerId, exp.title, exp.company, exp.duration, exp.description]);
        }

        // 5. Update education
        await connection.query('DELETE FROM job_seeker_education WHERE job_seeker_id = ?', [jobSeekerId]);
        for (const edu of updateData.education) {
            await connection.query(`
                INSERT INTO job_seeker_education (job_seeker_id, degree, institution, duration)
                VALUES (?, ?, ?, ?)
            `, [jobSeekerId, edu.degree, edu.institution, edu.duration]);
        }

        console.log('✅ Update simulation done.');

        console.log('--- Simulating getProfile ---');
        const [jobseekerInfo] = await connection.query('SELECT * FROM job_seekers WHERE user_id = ?', [userId]);
        const [profile] = await connection.query('SELECT * FROM job_seeker_profiles WHERE user_id = ?', [userId]);
        const [experience] = await connection.query('SELECT * FROM job_seeker_experience WHERE job_seeker_id = ?', [jobSeekerId]);
        const [education] = await connection.query('SELECT * FROM job_seeker_education WHERE job_seeker_id = ?', [jobSeekerId]);

        const result = {
            summary: profile[0]?.professional_summary,
            skills: jobseekerInfo[0]?.skills ? jobseekerInfo[0].skills.split(',') : [],
            experience: experience.map(exp => ({
                title: exp.job_title,
                company: exp.company_name,
                duration: exp.duration,
                description: exp.description
            })),
            education: education.map(edu => ({
                institution: edu.institution,
                degree: edu.degree,
                duration: edu.duration
            }))
        };

        console.log('Resulting Data:', JSON.stringify(result, null, 2));

        if (result.experience.length === 2 && result.education.length === 1 && result.skills.includes('React')) {
            console.log('✅ Verification PASSED: Data persists and maps correctly.');
        } else {
            console.log('❌ Verification FAILED: Data mismatch.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        if (connection) await connection.end();
    }
})();
