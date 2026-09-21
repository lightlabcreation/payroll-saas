const db = require('../config/mysql');
const path = require('path');

// Helper to get or create job seeker entry in job_seekers table (for extra profile info)
const getJobSeekerId = async (userId) => {
    let [rows] = await db.query('SELECT id FROM job_seekers WHERE user_id = ?', [userId]);
    if (rows.length === 0) {
        // Fetch user info to populate job_seekers
        const [user] = await db.query('SELECT name, email, phone FROM users WHERE id = ?', [userId]);
        const [result] = await db.query(
            'INSERT INTO job_seekers (user_id, name, email, phone) VALUES (?, ?, ?, ?)',
            [userId, user[0].name, user[0].email, user[0].phone]
        );
        return result.insertId;
    }
    return rows[0].id;
};

// 1. Dashboard: Get Stats and Recent Activity
const getStatsDashboard = async (req, res, next) => {
    try {
        const [countApplied] = await db.query(
            'SELECT COUNT(*) as count FROM job_applications WHERE jobseeker_id = ?',
            [req.user.id]
        );

        const [countActive] = await db.query(
            "SELECT COUNT(*) as count FROM job_applications WHERE jobseeker_id = ? AND status IN ('Under Review', 'Shortlisted', 'Interview Scheduled')",
            [req.user.id]
        );

        const [recentApps] = await db.query(`
            SELECT ja.*, j.title as job_title, e.company_name
            FROM job_applications ja
            JOIN jobs j ON ja.job_id = j.id
            LEFT JOIN employers e ON j.employer_id = e.id
            WHERE ja.jobseeker_id = ?
            ORDER BY ja.applied_at DESC
            LIMIT 5
        `, [req.user.id]);

        res.json({
            success: true,
            data: {
                summary: {
                    totalApplications: countApplied[0].count,
                    activeApplications: countActive[0].count,
                    savedJobs: 0
                },
                recentApplications: recentApps
            }
        });
    } catch (err) { next(err); }
};

// 1.1 Dashboard: Get All Jobs for the Job Portal
const getDashboardJobs = async (req, res, next) => {
    try {
        const [jobs] = await db.query(`
            SELECT j.*, e.company_name, e.company_logo
            FROM jobs j
            LEFT JOIN employers e ON j.employer_id = e.id
            WHERE j.status = 'Active'
            ORDER BY j.created_at DESC
        `);

        res.json({ success: true, data: jobs });
    } catch (err) { next(err); }
};

// 2. View Job Details
const getJobDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [jobs] = await db.query(`
            SELECT j.*, e.company_name, e.website, e.company_address, e.company_logo
            FROM jobs j
            LEFT JOIN employers e ON j.employer_id = e.id
            WHERE j.id = ?
        `, [id]);

        if (jobs.length === 0) return res.status(404).json({ success: false, message: 'Job not found' });

        // Update views count
        await db.query('UPDATE jobs SET views_count = views_count + 1 WHERE id = ?', [id]);

        res.json({ success: true, data: jobs[0] });
    } catch (err) { next(err); }
};

// 3. Submit/Upload Resume
const submitResume = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const { title, resume_data } = req.body;
        // Store only the relative path (relative to backend root)
        const filePath = 'uploads/' + req.file.filename;
        const finalTitle = title || req.file.originalname;

        // Unset previous defaults for this user
        await db.query('UPDATE resumes SET is_default = 0 WHERE user_id = ?', [req.user.id]);

        const [result] = await db.query(`
            INSERT INTO resumes (user_id, file_path, title, resume_data, is_default, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, 1, NOW(), NOW())
        `, [req.user.id, filePath, finalTitle, resume_data || null]);

        res.json({
            success: true,
            message: 'Resume uploaded successfully',
            data: { id: result.insertId, filePath, title: finalTitle }
        });
    } catch (err) { next(err); }
};

// Get My Resumes
const getMyResumes = async (req, res, next) => {
    try {
        const [resumes] = await db.query('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC', [req.user.id]);
        res.json({ success: true, data: resumes });
    } catch (err) { next(err); }
};

// 4. Apply for Job
const applyJob = async (req, res, next) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        const { jobId } = req.params;
        const { cover_letter, resume_id } = req.body;

        // Check if job exists
        const [jobRows] = await connection.query('SELECT id, status FROM jobs WHERE id = ?', [jobId]);
        if (jobRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        if (jobRows[0].status !== 'Active') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'This job is no longer active' });
        }

        // Check if user already applied
        const [existing] = await connection.query(`
            SELECT id FROM job_applications 
            WHERE job_id = ? AND jobseeker_id = ?
        `, [jobId, req.user.id]);

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'You have already applied for this job.' });
        }

        // Get resume path
        let resumePath = null;
        if (resume_id) {
            const [resRows] = await connection.query('SELECT file_path FROM resumes WHERE id = ? AND user_id = ?', [resume_id, req.user.id]);
            if (resRows.length > 0) resumePath = resRows[0].file_path;
        } else {
            const [resRows] = await connection.query('SELECT file_path FROM resumes WHERE user_id = ? AND is_default = 1 LIMIT 1', [req.user.id]);
            if (resRows.length > 0) resumePath = resRows[0].file_path;
        }

        if (!resumePath) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Please upload a resume first.' });
        }

        // Fetch user info for job_applications columns
        const [user] = await connection.query('SELECT name, email, phone FROM users WHERE id = ?', [req.user.id]);

        // Fetch extra job seeker info if available
        const [jsRows] = await connection.query('SELECT skills, education, experience FROM job_seekers WHERE user_id = ?', [req.user.id]);
        const jsInfo = jsRows[0] || {};

        await connection.query(`
            INSERT INTO job_applications (job_id, jobseeker_id, resume, applicant_name, email, phone, cover_letter, skills, education, experience, status, applied_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Under Review', NOW(), NOW(), NOW())
        `, [
            jobId, req.user.id, resumePath, user[0].name, user[0].email, user[0].phone,
            cover_letter || null, jsInfo.skills || null, jsInfo.education || null, jsInfo.experience || null
        ]);

        // Increment applicants count
        await connection.query('UPDATE jobs SET applicants_count = applicants_count + 1 WHERE id = ?', [jobId]);

        await connection.commit();
        res.json({ success: true, message: 'Application submitted successfully.' });
    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

// 5. Get Applied Jobs
const getAppliedJobs = async (req, res, next) => {
    try {
        const [rows] = await db.query(`
            SELECT ja.*, j.title as job_title, j.description as job_description, j.location as job_location, 
                   j.job_type, j.salary_min, j.salary_max,
                   e.company_name, e.company_logo
            FROM job_applications ja
            JOIN jobs j ON ja.job_id = j.id
            LEFT JOIN employers e ON j.employer_id = e.id
            WHERE ja.jobseeker_id = ?
            ORDER BY ja.applied_at DESC
        `, [req.user.id]);

        const formatted = rows.map(app => ({
            id: app.id,
            job_id: app.job_id,
            status: app.status,
            applied_at: app.applied_at,
            resume: app.resume,
            cover_letter: app.cover_letter,
            job: {
                id: app.job_id,
                title: app.job_title,
                description: app.job_description,
                location: app.job_location,
                job_type: app.job_type,
                salary_min: app.salary_min,
                salary_max: app.salary_max,
                employer: {
                    company_name: app.company_name,
                    company_logo: app.company_logo
                }
            }
        }));

        res.json({ success: true, data: formatted });
    } catch (err) { next(err); }
};

// Withdraw Application
const withdrawApplication = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [app] = await db.query('SELECT * FROM job_applications WHERE id = ? AND jobseeker_id = ?', [id, req.user.id]);

        if (app.length === 0) return res.status(404).json({ success: false, message: 'Application not found' });

        // Decrement applicants count
        await db.query('UPDATE jobs SET applicants_count = GREATEST(0, applicants_count - 1) WHERE id = ?', [app[0].job_id]);

        await db.query('DELETE FROM job_applications WHERE id = ?', [id]);
        res.json({ success: true, message: 'Application withdrawn successfully' });
    } catch (err) { next(err); }
};

// 6. Profile Management
const getProfile = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);

        const [jobseekerInfo] = await db.query('SELECT * FROM job_seekers WHERE user_id = ?', [req.user.id]);
        const [profile] = await db.query('SELECT * FROM job_seeker_profiles WHERE user_id = ?', [req.user.id]);
        const [skills] = await db.query('SELECT * FROM job_seeker_skills WHERE job_seeker_id = ?', [jobSeekerId]);
        const [experience] = await db.query('SELECT * FROM job_seeker_experience WHERE job_seeker_id = ? ORDER BY start_date DESC', [jobSeekerId]);
        const [education] = await db.query('SELECT * FROM job_seeker_education WHERE job_seeker_id = ? ORDER BY start_year DESC', [jobSeekerId]);
        const [user] = await db.query('SELECT name, email, phone, profile_image FROM users WHERE id = ?', [req.user.id]);

        res.json({
            success: true,
            data: {
                ...(user[0] || {}),
                ...(jobseekerInfo[0] || {}),
                ...(profile[0] || {}),
                // Computed/Aliased fields for frontend
                summary: profile[0]?.professional_summary,
                professionalSummary: profile[0]?.professional_summary,
                location: jobseekerInfo[0]?.location || profile[0]?.preferred_location,
                headline: jobseekerInfo[0]?.level || 'Job Seeker',
                skills: jobseekerInfo[0]?.skills ? jobseekerInfo[0].skills.split(',') : [],
                experience: experience.map(exp => ({
                    id: exp.id,
                    title: exp.job_title,
                    company: exp.company_name,
                    duration: exp.duration,
                    description: exp.description
                })),
                education: education.map(edu => ({
                    id: edu.id,
                    institution: edu.institution || edu.school_name,
                    degree: edu.degree,
                    duration: edu.duration
                })),
                industry: profile[0]?.job_industry,
                role: jobseekerInfo[0]?.current_company || profile[0]?.job_industry,
                preferred_location: profile[0]?.preferred_location,
                salary_expectation: profile[0]?.salary_expectation || 'Not Specified',
                is_visible: profile[0]?.visibility === 'visible'
            }
        });
    } catch (err) { next(err); }
};

const updateProfile = async (req, res, next) => {
    try {
        const {
            name, phone, skills, experience, education, current_company, level,
            professional_summary, summary, professionalSummary,
            job_industry, industry,
            preferred_location, location,
            visibility, is_visible,
            headline, salary_expectation
        } = req.body;

        const jobSeekerId = await getJobSeekerId(req.user.id);

        // Map frontend fields to DB fields
        const final_summary = professional_summary || summary || professionalSummary;
        const final_industry = job_industry || industry;
        const final_location = preferred_location || location;
        const final_visibility = visibility || (is_visible === true ? 'visible' : (is_visible === false ? 'hidden' : 'visible'));

        // Update Users table
        if (name || phone) {
            await db.query('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?', [name, phone, req.user.id]);
        }

        // Update job_seekers table
        let skillsStr = skills;
        if (Array.isArray(skills)) skillsStr = skills.join(',');

        await db.query(`
            UPDATE job_seekers 
            SET name = COALESCE(?, name), phone = COALESCE(?, phone), 
                skills = COALESCE(?, skills), experience = COALESCE(?, experience), 
                education = COALESCE(?, education), current_company = COALESCE(?, current_company), 
                level = COALESCE(?, level), location = COALESCE(?, location)
            WHERE user_id = ?
        `, [name, phone, skillsStr, Array.isArray(experience) ? 'Array' : experience, Array.isArray(education) ? 'Array' : education, current_company, level || headline, final_location, req.user.id]);

        // Upsert Profile
        const [existing] = await db.query('SELECT id FROM job_seeker_profiles WHERE user_id = ?', [req.user.id]);
        if (existing.length > 0) {
            await db.query(`
                UPDATE job_seeker_profiles 
                SET professional_summary = ?, job_industry = ?, preferred_location = ?, visibility = ?, salary_expectation = ?
                WHERE user_id = ?
            `, [final_summary, final_industry, final_location, final_visibility, salary_expectation, req.user.id]);
        } else {
            await db.query(`
                INSERT INTO job_seeker_profiles (user_id, professional_summary, job_industry, preferred_location, visibility, salary_expectation)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [req.user.id, final_summary, final_industry, final_location, final_visibility, salary_expectation]);
        }

        // --- Handle Experience and Education Arrays (Sync specialized tables) ---
        if (Array.isArray(experience)) {
            await db.query('DELETE FROM job_seeker_experience WHERE job_seeker_id = ?', [jobSeekerId]);
            for (const exp of experience) {
                await db.query(`
                    INSERT INTO job_seeker_experience (job_seeker_id, job_title, company_name, duration, description)
                    VALUES (?, ?, ?, ?, ?)
                `, [jobSeekerId, exp.title, exp.company, exp.duration, exp.description]);
            }
        }

        if (Array.isArray(education)) {
            await db.query('DELETE FROM job_seeker_education WHERE job_seeker_id = ?', [jobSeekerId]);
            for (const edu of education) {
                await db.query(`
                    INSERT INTO job_seeker_education (job_seeker_id, degree, institution, school_name, duration)
                    VALUES (?, ?, ?, ?, ?)
                `, [jobSeekerId, edu.degree, edu.institution, edu.institution, edu.duration]);
            }
        }

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) { next(err); }
};

// Skills CRUD
const addSkill = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);
        const { skill_name, proficiency } = req.body;
        await db.query('INSERT INTO job_seeker_skills (job_seeker_id, skill_name, proficiency) VALUES (?, ?, ?)', [jobSeekerId, skill_name, proficiency]);
        res.json({ success: true, message: 'Skill added' });
    } catch (err) { next(err); }
};
const deleteSkill = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);
        const { id } = req.params;
        await db.query('DELETE FROM job_seeker_skills WHERE id = ? AND job_seeker_id = ?', [id, jobSeekerId]);
        res.json({ success: true, message: 'Skill removed' });
    } catch (err) { next(err); }
};

// Experience CRUD
const addExperience = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);
        const { job_title, company_name, start_date, end_date, is_current, description } = req.body;
        await db.query(`
            INSERT INTO job_seeker_experience (job_seeker_id, job_title, company_name, start_date, end_date, is_current, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [jobSeekerId, job_title, company_name, start_date, end_date, is_current, description]);
        res.json({ success: true, message: 'Experience added' });
    } catch (err) { next(err); }
};

// Education CRUD
const addEducation = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);
        const { degree, school_name, field_of_study, start_year, passing_year, grade } = req.body;
        await db.query(`
            INSERT INTO job_seeker_education (job_seeker_id, degree, school_name, field_of_study, start_year, passing_year, grade)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [jobSeekerId, degree, school_name, field_of_study, start_year, passing_year, grade]);
        res.json({ success: true, message: 'Education added' });
    } catch (err) { next(err); }
};

const deleteExperience = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);
        const { id } = req.params;
        await db.query('DELETE FROM job_seeker_experience WHERE id = ? AND job_seeker_id = ?', [id, jobSeekerId]);
        res.json({ success: true, message: 'Experience removed' });
    } catch (err) { next(err); }
};

const deleteEducation = async (req, res, next) => {
    try {
        const jobSeekerId = await getJobSeekerId(req.user.id);
        const { id } = req.params;
        await db.query('DELETE FROM job_seeker_education WHERE id = ? AND job_seeker_id = ?', [id, jobSeekerId]);
        res.json({ success: true, message: 'Education removed' });
    } catch (err) { next(err); }
};


module.exports = {
    getStatsDashboard,
    getDashboardJobs,
    getJobDetails,
    submitResume,
    getMyResumes,
    applyJob,
    getAppliedJobs,
    withdrawApplication,
    getProfile,
    updateProfile,
    addSkill,
    deleteSkill,
    addExperience,
    deleteExperience,
    addEducation,
    deleteEducation
};

