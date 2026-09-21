const db = require('../config/mysql');
const bcrypt = require('bcrypt');

/**
 * Get Employer Dashboard Data
 */
/**
 * Get Employer Dashboard Data
 */
const getDashboard = async (req, res, next) => {
  try {
    const employerId = req.user.id;

    // Get employer record
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    // Get statistics
    const [jobCount] = await db.query('SELECT COUNT(*) as count FROM jobs WHERE employer_id = ?', [employer.id]);
    const [activeJobCount] = await db.query("SELECT COUNT(*) as count FROM jobs WHERE employer_id = ? AND status = 'Active'", [employer.id]);
    const [appCount] = await db.query(`
        SELECT COUNT(*) as count 
        FROM job_applications ja
        JOIN jobs j ON ja.job_id = j.id
        WHERE j.employer_id = ?
  `, [employer.id]);
    const [empCount] = await db.query('SELECT COUNT(*) as count FROM employees WHERE employer_id = ?', [employer.id]);

    res.json({
      success: true,
      data: {
        employer: {
          id: employer.id,
          company_name: employer.company_name,
          status: employer.status,
        },
        summary: {
          totalJobs: jobCount[0].count,
          activeJobs: activeJobCount[0].count,
          totalApplications: appCount[0].count,
          totalEmployees: empCount[0].count,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Job
 */
/**
 * Create Job
 */
const createJob = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    const { title, description, benefits, requirements, job_type, location, salary_range, salary_min, salary_max, experience_required, experience, skills, expiry_date, status, is_active, department, employer_type } = req.body;

    const jobData = {
      employer_id: employer.id,
      title,
      department,
      employer_type,
      description,
      benefits,
      requirements,
      job_type,
      location,
      salary_min,
      salary_max,
      experience: experience || experience_required,
      skills,
      expiry_date,
      status: status || 'Active',
      is_active: is_active !== undefined ? is_active : true, // Default active
      posted_date: new Date(),
    };

    // Support salary_range input (string like "30000-50000" or object {min,max})
    if (salary_range && (!salary_min || !salary_max)) {
      if (typeof salary_range === 'string') {
        const parts = salary_range.split('-').map(p => p.trim()).filter(Boolean);
        const min = Number(parts[0]);
        const max = Number(parts[1]);
        if (!Number.isNaN(min)) jobData.salary_min = min;
        if (!Number.isNaN(max)) jobData.salary_max = max;
      } else if (typeof salary_range === 'object' && salary_range !== null) {
        if (salary_range.min !== undefined) jobData.salary_min = Number(salary_range.min);
        if (salary_range.max !== undefined) jobData.salary_max = Number(salary_range.max);
      }
    }

    // Check expiry date and set status
    if (jobData.expiry_date && new Date(jobData.expiry_date) < new Date()) {
      jobData.status = 'Closed';
    }

    const [result] = await db.query(
      `INSERT INTO jobs(employer_id, title, department, employer_type, description, benefits, requirements, job_type, location, salary_min, salary_max, experience, skills, expiry_date, status, is_active, posted_date, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        jobData.employer_id, jobData.title, jobData.department, jobData.employer_type, jobData.description, jobData.benefits, jobData.requirements,
        jobData.job_type, jobData.location, jobData.salary_min, jobData.salary_max, jobData.experience,
        jobData.skills, jobData.expiry_date, jobData.status, jobData.is_active, jobData.posted_date
      ]
    );

    // return the created job with employer info for immediate verification
    const [jobs] = await db.query(`
        SELECT j.*, e.company_name, e.company_logo 
        FROM jobs j
        JOIN employers e ON j.employer_id = e.id
        WHERE j.id = ?
  `, [result.insertId]);

    const created = jobs[0];
    const formatted = {
      ...created,
      employer: {
        id: created.employer_id,
        company_name: created.company_name,
        company_logo: created.company_logo
      },
      company_name: undefined, company_logo: undefined
    };

    res.status(201).json({
      success: true,
      message: 'Job posted successfully.',
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Jobs (for employer)
 */
/**
 * Get All Jobs (for employer)
 */
const getAllJobs = async (req, res, next) => {
  console.log(`GET /api/employer/jobs called by user ${req.user.id}`);
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    const { status, search } = req.query;
    let sql = 'SELECT * FROM jobs WHERE employer_id = ?';
    const params = [employer.id];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`% ${search}% `, ` % ${search}% `);
    }

    sql += ' ORDER BY created_at DESC';

    const [jobs] = await db.query(sql, params);

    // Fetch applications count/details for each job?
    // The previous implementation included specific application attributes.
    // For list view, usually just count is enough or maybe list of IDs.
    // Let's attach application summaries.
    const jobIds = jobs.map(j => j.id);
    let appMap = {};
    if (jobIds.length > 0) {
      const [apps] = await db.query('SELECT id, job_id, status FROM job_applications WHERE job_id IN (?)', [jobIds]);
      apps.forEach(a => {
        if (!appMap[a.job_id]) appMap[a.job_id] = [];
        appMap[a.job_id].push(a);
      });
    }

    const formatted = jobs.map(j => ({
      ...j,
      applications: appMap[j.id] || []
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Single Job
 */
/**
 * Get Single Job
 */
const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ? AND employer_id = ?', [id, employer.id]);
    const job = jobs[0];

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.',
      });
    }

    // Get applications with jobseeker info
    const [applications] = await db.query(`
        SELECT ja.*, u.id as u_id, u.name as u_name, u.email as u_email
        FROM job_applications ja
        LEFT JOIN users u ON ja.jobseeker_id = u.id
        WHERE ja.job_id = ?
  `, [id]);

    const formattedApps = applications.map(a => ({
      ...a,
      jobseeker: {
        id: a.u_id, // or job_seeker_id
        name: a.u_name,
        email: a.u_email
      },
      u_id: undefined, u_name: undefined, u_email: undefined
    }));

    res.json({
      success: true,
      data: {
        ...job,
        applications: formattedApps
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Job
 */
/**
 * Update Job
 */
const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [jobs] = await db.query('SELECT * FROM jobs WHERE id = ? AND employer_id = ?', [id, employer.id]);
    const job = jobs[0];

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.',
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    // Whitelist allowed fields or iterate body (safer to whitelist common ones)
    const allowed = ['title', 'department', 'employer_type', 'description', 'benefits', 'requirements', 'job_type', 'location',
      'salary_min', 'salary_max', 'experience', 'skills', 'expiry_date', 'status', 'is_active'];

    for (const key of Object.keys(req.body)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }

    // Special logic: expiry check
    if (req.body.expiry_date && new Date(req.body.expiry_date) < new Date()) {
      if (!updates.includes('status = ?')) {
        updates.push('status = ?');
        params.push('Closed');
      } else {
        // Overwrite status if user sent it but expiry forces closed? 

        // Actually, if user sets expiry date to past, we force Close.
        const idx = updates.indexOf('status = ?');
        params[idx] = 'Closed';
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await db.query(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ? `, params);
    }

    const [updated] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Job updated successfully.',
      data: updated[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Job
 */
/**
 * Delete Job
 */
const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [result] = await db.query('DELETE FROM jobs WHERE id = ? AND employer_id = ?', [id, employer.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.',
      });
    }

    res.json({
      success: true,
      message: 'Job deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Job Applications
 */
/**
 * Get Job Applications
 */
const getJobApplications = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [jobRows] = await db.query('SELECT * FROM jobs WHERE id = ? AND employer_id = ?', [jobId, employer.id]);
    if (jobRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.',
      });
    }

    const [applications] = await db.query(`
        SELECT ja.*, u.id as u_id, u.name as u_name, u.email as u_email
        FROM job_applications ja
        JOIN users u ON ja.jobseeker_id = u.id
        WHERE ja.job_id = ?
  ORDER BY ja.applied_at DESC
    `, [jobId]);

    const formatted = applications.map(a => ({
      ...a,
      jobseeker: {
        id: a.u_id, // or job_seeker_id which is in 'a'
        name: a.u_name,
        email: a.u_email
      },
      u_id: undefined, u_name: undefined, u_email: undefined
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Application Status
 */
/**
 * Update Application Status
 */
const updateApplicationStatus = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;

    // We need application -> job -> employer to verify user permission
    const [rows] = await db.query(`
        SELECT ja.*, j.employer_id, e.user_id as employer_user_id
        FROM job_applications ja
        JOIN jobs j ON ja.job_id = j.id
        JOIN employers e ON j.employer_id = e.id
        WHERE ja.id = ?
  `, [applicationId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.',
      });
    }

    const application = rows[0];

    // Verify employer permission
    if (application.employer_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this application.',
      });
    }

    await db.query('UPDATE job_applications SET status = ?, updated_at = NOW() WHERE id = ?', [status, applicationId]);

    // Fetch updated for response
    const [updated] = await db.query('SELECT * FROM job_applications WHERE id = ?', [applicationId]);

    res.json({
      success: true,
      message: 'Application status updated successfully.',
      data: updated[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Credit Balance
 */
/**
 * Get Credit Balance
 */
const getCreditBalance = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    const [creditRows] = await db.query('SELECT * FROM credits WHERE employer_id = ?', [employer.id]);
    let credit = creditRows[0];

    if (!credit) {
      // Create default if not exists
      const [result] = await db.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used) VALUES (?, 0, 0, 0)',
        [employer.id]
      );
      credit = { balance: 0, total_added: 0, total_used: 0 };
    }

    res.json({
      success: true,
      data: {
        balance: parseFloat(credit.balance || 0),
        total_added: parseFloat(credit.total_added || 0),
        total_used: parseFloat(credit.total_used || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Transactions
 */
/**
 * Get Transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    const [transactions] = await db.query(`
        SELECT t.*, e.company_name as employer_name 
        FROM transactions t
        LEFT JOIN employers e ON t.employer_id = e.id
        WHERE t.user_id = ? OR t.employer_id = ?
        ORDER BY t.date DESC 
        LIMIT 100
    `, [req.user.id, employer.id]);

    res.json({
      success: true,
      data: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        description: t.description,
        beneficiary: t.beneficiary,
        employer_name: t.employer_name,
        reference: t.reference,
        status: t.status,
        date: t.date,
        created_at: t.created_at,
        account_number: t.account_number,
        payment_method: t.payment_method,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Beneficiaries
 */
/**
 * Get Beneficiaries
 */
const getBeneficiaries = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    // Assuming Beneficiary table exists (not part of common schema but used in original code)
    // If not, this might fail, but code implies it exists.
    const [beneficiaries] = await db.query('SELECT * FROM beneficiaries WHERE employer_id = ? ORDER BY created_at DESC', [employer.id]);

    res.json({
      success: true,
      data: beneficiaries,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Credit History
 */
/**
 * Get Credit History
 */
const getCreditHistory = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    const [transactions] = await db.query(`
SELECT * FROM transactions
        WHERE employer_id = ? AND type IN ('credit', 'debit')
        ORDER BY date DESC
        LIMIT 50
  `, [employer.id]);

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Transaction Chart Data
 */
/**
 * Get Transaction Chart Data
 */
const getTransactionChart = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    // Get last 6 months data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [transactions] = await db.query(`
        SELECT DATE_FORMAT(date, '%Y-%m') as month, SUM(amount) as total
        FROM transactions
        WHERE employer_id = ? AND date >= ?
  GROUP BY DATE_FORMAT(date, '%Y-%m')
        ORDER BY DATE_FORMAT(date, '%Y-%m') ASC
  `, [employer.id, sixMonthsAgo]);

    res.json({
      success: true,
      data: {
        labels: transactions.map(t => t.month),
        data: transactions.map(t => parseFloat(t.total || 0)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== EMPLOYEE MANAGEMENT (EMPLOYER'S OWN EMPLOYEES) ====================
 */

/**
 * Get All Employees (for current employer)
 */
const getMyEmployees = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }
    const employer = empRows[0];

    const [employees] = await db.query(`
        SELECT emp.*, u.id as u_id, u.name as u_name, u.email as u_email, u.phone as phone, u.status as u_status, u.created_at as u_created_at,
  bd.account_number, bd.ifsc_code, bd.bank_name
        FROM employees emp
        JOIN users u ON emp.user_id = u.id
        LEFT JOIN bank_details bd ON emp.id = bd.employee_id AND bd.is_primary = 1
        WHERE emp.employer_id = ?
  ORDER BY emp.created_at DESC
    `, [employer.id]);

    const formatted = employees.map(emp => ({
      ...emp,
      user: {
        id: emp.u_id,
        name: emp.u_name,
        email: emp.u_email,
        phone: emp.phone,
        status: emp.u_status,
        created_at: emp.u_created_at
      },
      bank_detail: {
        account_number: emp.account_number,
        ifsc_code: emp.ifsc_code,
        bank_name: emp.bank_name
      },
      u_id: undefined, u_name: undefined, u_email: undefined, u_status: undefined, u_created_at: undefined,
      account_number: undefined, ifsc_code: undefined, bank_name: undefined
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Employee
 */
const addEmployee = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    let employer = req.employer;
    if (!employer) {
      const [rows] = await connection.execute('SELECT * FROM employers WHERE user_id = ? LIMIT 1', [req.user.id]);
      if (rows.length > 0) {
        employer = rows[0];
      }
    }

    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employer profile not found.' });
    }

    const { name, email, password, phone, joining_date, job_title, designation, salary } = req.body;
    const finalJobTitle = job_title || designation;

    // Validate required fields
    if (!name || !email || !password || !phone || !joining_date || !finalJobTitle) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'name, email, password, phone, joining_date, job_title/designation are required.',
      });
    }

    // Check email duplication
    const [existingUser] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'User with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into users table
    // Using company_id from employer record
    const [userResult] = await connection.execute(
      `INSERT INTO users(name, email, password, phone, role, company_id, status, created_at, updated_at)
VALUES(?, ?, ?, ?, 'employee', ?, 'active', NOW(), NOW())`,
      [name, email, hashedPassword, phone, employer.company_id]
    );
    const userId = userResult.insertId;

    // Insert into employees table
    const [empResult] = await connection.execute(
      `INSERT INTO employees(user_id, employer_id, company_id, designation, salary, joining_date, status, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [userId, employer.id, employer.company_id, finalJobTitle, salary || 0, joining_date]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Employee added successfully'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update Employee
 */
const updateEmployee = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employeeId } = req.params;
    const [empRows] = await connection.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [employeeRows] = await connection.query(
      'SELECT * FROM employees WHERE id = ? AND employer_id = ?',
      [employeeId, employer.id]
    );
    const employee = employeeRows[0];

    if (!employee) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    const { designation, job_title, salary, status, name, email, joining_date, phone } = req.body;
    const finalJobTitle = job_title || designation;

    // Update employee table
    const empUpdates = [];
    const empParams = [];
    if (finalJobTitle !== undefined) { empUpdates.push('designation = ?'); empParams.push(finalJobTitle); }
    if (salary !== undefined) { empUpdates.push('salary = ?'); empParams.push(salary); }
    if (status !== undefined) { empUpdates.push('status = ?'); empParams.push(status); }
    if (joining_date !== undefined) { empUpdates.push('joining_date = ?'); empParams.push(joining_date); }

    if (empUpdates.length > 0) {
      empParams.push(employeeId);
      await connection.query(`UPDATE employees SET ${empUpdates.join(', ')} WHERE id = ? `, empParams);
    }

    // Update user table
    if (name || email || phone) {
      // Need current user info first for email check?
      const [userRows] = await connection.query('SELECT * FROM users WHERE id = ?', [employee.user_id]);
      const user = userRows[0];

      if (email && email !== user.email) {
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
          await connection.rollback();
          return res.status(409).json({ success: false, message: 'Email already in use.' });
        }
      }

      const userUpdates = [];
      const userParams = [];
      if (name) { userUpdates.push('name = ?'); userParams.push(name); }
      if (email) { userUpdates.push('email = ?'); userParams.push(email); }
      if (phone) { userUpdates.push('phone = ?'); userParams.push(phone); }


      if (userUpdates.length > 0) {
        userParams.push(user.id);
        await connection.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ? `, userParams);
      }
    }

    await connection.commit();

    // Fetch updated
    const [updatedEmp] = await db.query(`
        SELECT emp.*, u.name as u_name, u.email as u_email, u.phone as u_phone
        FROM employees emp
        JOIN users u ON emp.user_id = u.id
        WHERE emp.id = ?
  `, [employeeId]);

    const formatted = {
      ...updatedEmp[0],
      user: {
        id: updatedEmp[0].user_id,
        name: updatedEmp[0].u_name,
        email: updatedEmp[0].u_email,
        phone: updatedEmp[0].u_phone
      },
      u_name: undefined, u_email: undefined, u_phone: undefined
    };

    res.json({
      success: true,
      message: 'Employee updated successfully.',
      data: formatted,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Delete Employee
 */
const deleteEmployee = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employeeId } = req.params;
    const [empRows] = await connection.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [employeeRows] = await connection.query(
      'SELECT user_id FROM employees WHERE id = ? AND employer_id = ?',
      [employeeId, employer.id]
    );

    if (employeeRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    const userId = employeeRows[0].user_id;

    await connection.query('DELETE FROM employees WHERE id = ?', [employeeId]);
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    await connection.commit();

    res.json({
      success: true,
      message: 'Employee deleted successfully.',
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * ==================== VENDOR MANAGEMENT (EMPLOYER'S OWN VENDORS) ====================
 */

/**
 * Get All Vendors (for current employer)
 */
const getMyVendors = async (req, res, next) => {
  try {
    // Get vendors linked to this employer through transactions or contracts
    // Previous logic actually returned ALL VENDORS system-wide (?!). 
    // "For now, return all vendors. In production, you'd filter by employer-vendor relationship".
    // I will stick to returning all vendors for now as per previous logic, 
    // but fetching efficiently.

    const employerId = req.user.id;
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [employerId]);
    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employer profile not found.' });
    }
    const employer = empRows[0];

    const [vendors] = await db.query(`
        SELECT v.*, v.service_type as services, v.salary, v.joining_date, u.name as u_name, u.email as u_email, u.phone as u_phone, u.status as u_status 
        FROM vendors v
        JOIN users u ON v.user_id = u.id
        WHERE v.company_id = ? AND (v.employer_id = ? OR v.employer_id IS NULL)
  ORDER BY v.created_at DESC
    `, [employer.company_id, employer.id]);

    const formatted = vendors.map(v => ({
      ...v,
      user: {
        id: v.user_id,
        name: v.u_name,
        email: v.u_email,
        phone: v.u_phone,
        status: v.u_status
      },
      u_name: undefined, u_email: undefined, u_status: undefined, u_phone: undefined
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Vendor
 */
const addVendor = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    let employer = req.employer;
    if (!employer) {
      const [rows] = await connection.execute('SELECT * FROM employers WHERE user_id = ? LIMIT 1', [req.user.id]);
      if (rows.length > 0) {
        employer = rows[0];
      }
    }

    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employer profile not found.' });
    }

    const { name, email, password, phone, joining_date, job_title, designation, salary } = req.body;
    const finalJobTitle = job_title || designation;

    // Validate required fields
    if (!name || !email || !password || !phone || !joining_date || !finalJobTitle) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'name, email, password, phone, joining_date, job_title/designation are required.',
      });
    }

    // Check duplicate email
    const [existingUser] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'User with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into users table
    const [userResult] = await connection.execute(
      `INSERT INTO users(name, email, password, phone, role, company_id, status, created_at, updated_at)
VALUES(?, ?, ?, ?, 'vendor', ?, 'active', NOW(), NOW())`,
      [name, email, hashedPassword, phone, employer.company_id]
    );
    const userId = userResult.insertId;

    // Insert into vendors table
    // mapping job_title to service_type based on existing schema
    const [vendorResult] = await connection.execute(
      `INSERT INTO vendors(user_id, company_id, employer_id, company_name, contact_person, phone, email, service_type, salary, joining_date, status, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [userId, employer.company_id, employer.id, name, name, phone, email, finalJobTitle, salary || 0, joining_date]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Vendor added successfully'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update Vendor
 */
const updateVendor = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { vendorId } = req.params;
    const { company_name, contact_person, phone, email, address, service_type, job_title, designation, payment_status, status, salary, joining_date, name: userName } = req.body;
    const finalJobTitle = service_type || job_title || designation;

    const [empRows] = await db.query('SELECT id FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];
    const [vendorRows] = await connection.query('SELECT * FROM vendors WHERE id = ? AND employer_id = ?', [vendorId, employer.id]);
    const vendor = vendorRows[0];

    if (!vendor) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.',
      });
    }

    // Update vendors table
    const vendorUpdates = [];
    const vendorParams = [];
    if (company_name !== undefined) { vendorUpdates.push('company_name = ?'); vendorParams.push(company_name); }
    if (contact_person !== undefined) { vendorUpdates.push('contact_person = ?'); vendorParams.push(contact_person); }
    if (phone !== undefined) { vendorUpdates.push('phone = ?'); vendorParams.push(phone); }
    if (email !== undefined) { vendorUpdates.push('email = ?'); vendorParams.push(email); }
    if (address !== undefined) { vendorUpdates.push('address = ?'); vendorParams.push(address); }
    if (finalJobTitle !== undefined) { vendorUpdates.push('service_type = ?'); vendorParams.push(finalJobTitle); }
    if (salary !== undefined) { vendorUpdates.push('salary = ?'); vendorParams.push(salary); }
    if (joining_date !== undefined) { vendorUpdates.push('joining_date = ?'); vendorParams.push(joining_date); }
    if (payment_status !== undefined) { vendorUpdates.push('payment_status = ?'); vendorParams.push(payment_status); }
    if (status !== undefined) { vendorUpdates.push('status = ?'); vendorParams.push(status); }

    if (vendorUpdates.length > 0) {
      vendorParams.push(vendorId);
      await connection.query(`UPDATE vendors SET ${vendorUpdates.join(', ')} WHERE id = ? `, vendorParams);
    }

    // Update user table if name, email, or phone are provided
    if (userName || email || phone) {
      const [userRows] = await connection.query('SELECT * FROM users WHERE id = ?', [vendor.user_id]);
      const user = userRows[0];

      if (email && email !== user.email) {
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
          await connection.rollback();
          return res.status(409).json({ success: false, message: 'Email already in use.' });
        }
      }

      const userUpdates = [];
      const userParams = [];
      if (userName) { userUpdates.push('name = ?'); userParams.push(userName); }
      if (email) { userUpdates.push('email = ?'); userParams.push(email); }
      if (phone) { userUpdates.push('phone = ?'); userParams.push(phone); }

      if (userUpdates.length > 0) {
        userParams.push(user.id);
        await connection.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ? `, userParams);
      }
    }

    await connection.commit();

    const [updated] = await db.query(`
        SELECT v.*, u.name as u_name, u.email as u_email, u.phone as u_phone
        FROM vendors v
        JOIN users u ON v.user_id = u.id
        WHERE v.id = ?
  `, [vendorId]);

    const formatted = {
      ...updated[0],
      user: {
        id: updated[0].user_id,
        name: updated[0].u_name,
        email: updated[0].u_email,
        phone: updated[0].u_phone
      },
      u_name: undefined, u_email: undefined, u_phone: undefined
    };

    res.json({
      success: true,
      message: 'Vendor updated successfully.',
      data: formatted,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * ==================== ATTENDANCE MANAGEMENT ====================
 */

/**
 * Get Employee Attendance
 */
/**
 * Get Employee Attendance
 */
const getEmployeeAttendance = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { start_date, end_date } = req.query;

    // Check employer ownership
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    // Check employee
    const [employees] = await db.query('SELECT id FROM employees WHERE id = ? AND employer_id = ?', [employeeId, employer.id]);
    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    let sql = 'SELECT * FROM attendance WHERE employee_id = ?';
    const params = [employeeId];

    if (start_date && end_date) {
      sql += ' AND date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    sql += ' ORDER BY date DESC';

    const [attendance] = await db.query(sql, params);

    res.json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark Attendance
 */
/**
 * Mark Attendance
 */
const markAttendance = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { date, check_in, check_out, status, notes } = req.body;

    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    const [employees] = await db.query('SELECT id FROM employees WHERE id = ? AND employer_id = ?', [employeeId, employer.id]);
    const employee = employees[0];

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required.',
      });
    }

    // Calculate working hours if check_in and check_out provided
    let workingHours = null;
    if (check_in && check_out) {
      const checkInTime = new Date(`2000-01-01T${check_in} `);
      const checkOutTime = new Date(`2000-01-01T${check_out} `);
      const diffMs = checkOutTime - checkInTime;
      workingHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
    }

    // Check existing
    const [existing] = await db.query('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [employeeId, date]);

    let result;
    if (existing.length > 0) {
      // Update
      const updates = [];
      const params = [];
      if (check_in) { updates.push('check_in = ?'); params.push(check_in); }
      if (check_out) { updates.push('check_out = ?'); params.push(check_out); }
      if (status) { updates.push('status = ?'); params.push(status); }
      if (workingHours) {
        updates.push('total_hours = ?'); params.push(workingHours);
        updates.push('working_hours = ?'); params.push(workingHours);
      }
      if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(existing[0].id);
        await db.query(`UPDATE attendance SET ${updates.join(', ')} WHERE id = ? `, params);
      }

      const [updated] = await db.query('SELECT * FROM attendance WHERE id = ?', [existing[0].id]);
      result = updated[0];
    } else {
      // Create
      const [insert] = await db.query(
        `INSERT INTO attendance(employee_id, date, check_in, check_out, status, total_hours, working_hours, notes, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          employeeId, date, check_in || null, check_out || null,
          status || 'present', workingHours, workingHours, notes || null
        ]
      );
      const [created] = await db.query('SELECT * FROM attendance WHERE id = ?', [insert.insertId]);
      result = created[0];
    }

    res.json({
      success: true,
      message: existing.length > 0 ? 'Attendance updated successfully.' : 'Attendance marked successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== TRAINING MANAGEMENT ====================
 */

/**
 * Create Training
 */
/**
 * Create Training
 */
const createTraining = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];
    if (!employer) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }

    const { title, description, instructor, trainer_name, start_date, end_date, location, max_participants, category } = req.body;

    if (!title || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Title, start date, and end date are required.',
      });
    }

    const tName = trainer_name || instructor || 'N/A';

    const [result] = await db.query(
      `INSERT INTO training_courses(employer_id, title, description, trainer_name, start_date, end_date, location, max_participants, category, status, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', NOW(), NOW())`,
      [employer.id, title, description || '', tName, new Date(start_date), new Date(end_date), location || 'Virtual', max_participants || 100, category || 'Technical']
    );

    const [training] = await db.query('SELECT * FROM training_courses WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Training created successfully.',
      data: training[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Trainings
 */
/**
 * Get All Trainings
 */
const getAllTrainings = async (req, res, next) => {
  try {
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];
    if (!employer) {
      return res.status(404).json({
        success: false,
        message: 'Employer profile not found.',
      });
    }

    const [training_courses] = await db.query(
      'SELECT * FROM training_courses WHERE employer_id = ? ORDER BY start_date DESC',
      [employer.id]
    );

    // Fetch nested assignments with employees/users?
    // Map assignments to training?
    // Let's iterate and fetch assignments for now until we optimize with better SQL if needed.
    // Or single query with GROUP_CONCAT or JSON_ARRAYAGG if MySQL 5.7+

    const formatted = await Promise.all(training_courses.map(async (t) => {
      const [assignments] = await db.query(`
            SELECT ta.*, e.id as emp_id, u.name as emp_name, u.email as emp_email
            FROM training_enrollments ta
            JOIN employees e ON ta.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE ta.training_id = ?
  `, [t.id]);

      return {
        ...t,
        assignments: assignments.map(a => ({
          ...a,
          employee: {
            id: a.emp_id,
            user: { name: a.emp_name, email: a.emp_email }
          },
          emp_id: undefined, emp_name: undefined, emp_email: undefined
        }))
      };
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign Training to Employees
 */
/**
 * Assign Training to Employees
 */
const assignTrainingToEmployees = async (req, res, next) => {
  try {
    const { trainingId } = req.params;
    const { employee_ids } = req.body;
    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];

    if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee IDs array is required.',
      });
    }

    const [trainingRows] = await db.query('SELECT * FROM training_courses WHERE id = ? AND employer_id = ?', [trainingId, employer.id]);
    if (trainingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Training not found.',
      });
    }

    // Verify all employees belong to this employer
    const [employees] = await db.query('SELECT id FROM employees WHERE id IN (?) AND employer_id = ?', [employee_ids, employer.id]);

    if (employees.length !== employee_ids.length) {
      return res.status(400).json({
        success: false,
        message: 'Some employees do not belong to your company.',
      });
    }

    // Create assignments
    // Note: This needs to handle duplicates if we don't want to re-assign
    // Manual loop or ON DUPLICATE KEY UPDATE
    const vals = [];
    employee_ids.forEach(eid => {
      vals.push([trainingId, eid, 'assigned']);
    });

    // We can use INSERT IGNORE to skip existing assignments
    await db.query(
      'INSERT IGNORE INTO training_enrollments (training_id, employee_id, status, created_at, updated_at) VALUES ?',
      [vals.map(v => [...v, new Date(), new Date()])]
    );

    // Fetch assigned
    const [assigned] = await db.query('SELECT * FROM training_enrollments WHERE training_id = ? AND employee_id IN (?)', [trainingId, employee_ids]);

    res.json({
      success: true,
      message: 'Training assigned to employees successfully.',
      data: assigned,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== PAYMENT MANAGEMENT ====================
 */

/**
 * Pay Salary to Employee
 */
/**
 * Pay Salary to Employee
 */
const paySalary = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employeeId } = req.params;
    const { amount, payment_date, notes, account_number, ifsc_code, month, year } = req.body;

    // Get employer
    const [empRows] = await connection.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];
    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employer profile not found.' });
    }

    // Get employee details
    const [employeeRows] = await connection.query(`
        SELECT emp.*, u.name as u_name, u.email as u_email, u.id as user_id
        FROM employees emp
        JOIN users u ON emp.user_id = u.id
        WHERE emp.id = ? AND emp.employer_id = ?
  `, [employeeId, employer.id]);
    const employee = employeeRows[0];

    if (!employee) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const salaryAmount = parseFloat(amount || employee.salary || 0);
    if (salaryAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid salary amount.' });
    }

    // Check credits
    const [creditRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [employer.id]);
    let credit = creditRows[0];
    if (!credit) {
      // Create if not exists
      const [insertResult] = await connection.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used) VALUES (?, 0, 0, 0)',
        [employer.id]
      );
      credit = { id: insertResult.insertId, balance: 0, total_added: 0, total_used: 0 };
    }

    const payDate = payment_date ? new Date(payment_date) : new Date();
    const payMonth = month || payDate.toLocaleString('default', { month: 'long' });
    const payYear = year || payDate.getFullYear();

    // Check if balance is sufficient
    if (parseFloat(credit.balance) < salaryAmount) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient credit balance. Required: ${salaryAmount}, Available: ${credit.balance}`,
      });
    }

    // 1. Create salary record
    const [salResult] = await connection.query(
      `INSERT INTO salary_records(employee_id, amount, payment_date, month, year, payment_method, status, notes, created_at, updated_at)
VALUES(?, ?, ?, ?, ?, 'bank_transfer', 'paid', ?, NOW(), NOW())`,
      [employeeId, salaryAmount, payDate, payMonth, payYear, notes || null]
    );
    const salaryRecordId = salResult.insertId;

    // 2. Create transaction record for employer
    const [txnResult] = await connection.query(
      `INSERT INTO transactions(user_id, employer_id, type, amount, description, beneficiary, reference, status, account_number, payment_method, date, created_at, updated_at)
VALUES(?, ?, 'salary', ?, ?, ?, ?, 'success', ?, 'bank_transfer', ?, NOW(), NOW())`,
      [
        employee.user_id, employer.id, salaryAmount,
        `Salary payment for ${employee.u_name}`, employee.u_name,
        `SAL - ${salaryRecordId} `, account_number || null, payDate
      ]
    );

    // 3. Deduct from employer credit
    await connection.query(
      'UPDATE credits SET balance = balance - ?, total_used = total_used + ? WHERE id = ?',
      [salaryAmount, salaryAmount, credit.id]
    );

    // 4. Credit the EMPLOYEE's wallet
    await connection.query(
      'UPDATE employees SET credit_balance = credit_balance + ? WHERE id = ?',
      [salaryAmount, employeeId]
    );

    // 5. Record transaction for EMPLOYEE
    await connection.query(`
      INSERT INTO transactions(user_id, employer_id, type, amount, description, status, date, created_at, updated_at)
VALUES(?, ?, 'salary_credit', ?, ?, 'success', NOW(), NOW(), NOW())
    `, [employee.user_id, employer.id, salaryAmount, `Salary received from ${employer.company_name || 'Employer'} `]);

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Salary paid successfully.',
      data: { salaryRecordId, transactionId: txnResult.insertId }
    });
  } catch (error) {
    console.error('paySalary Error:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Pay Vendor
 */
const payVendor = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { vendorId } = req.params;
    const { amount, account_number, ifsc_code, payment_method, payment_reference, notes } = req.body;

    // Get employer
    const [empRows] = await connection.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    const employer = empRows[0];
    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employer profile not found.' });
    }

    // Get vendor details
    const [vendorRows] = await connection.query(`
        SELECT v.*, u.name as u_name
        FROM vendors v
        JOIN users u ON v.user_id = u.id
        WHERE v.id = ? AND v.employer_id = ?
  `, [vendorId, employer.id]);
    const vendor = vendorRows[0];

    if (!vendor) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }

    const payAmount = parseFloat(amount || 0);
    if (payAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payment amount.' });
    }

    // Check credits
    const [creditRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [employer.id]);
    let credit = creditRows[0];
    if (!credit) {
      // Create if not exists
      const [insertResult] = await connection.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used) VALUES (?, 0, 0, 0)',
        [employer.id]
      );
      credit = { id: insertResult.insertId, balance: 0, total_added: 0, total_used: 0 };
    }

    // 1. Create transaction record for employer
    const [txnResult] = await connection.query(
      `INSERT INTO transactions(user_id, employer_id, type, amount, description, beneficiary, reference, status, account_number, payment_method, date, created_at, updated_at)
VALUES(?, ?, 'vendor_payment', ?, ?, ?, ?, 'success', ?, ?, NOW(), NOW(), NOW())`,
      [
        vendor.user_id, employer.id, payAmount,
        notes || `Payment to vendor ${vendor.company_name} `, vendor.company_name,
        payment_reference || `VENDOR - ${vendorId} -${Date.now()} `,
        account_number || null, payment_method || 'bank_transfer'
      ]
    );

    // 2. Update vendor payment status
    await connection.query('UPDATE vendors SET payment_status = ? WHERE id = ?', ['paid', vendorId]);

    // 3. Deduct from employer credit
    await connection.query(
      'UPDATE credits SET balance = balance - ?, total_used = total_used + ? WHERE id = ?',
      [payAmount, payAmount, credit.id]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Vendor payment processed successfully.',
      data: { transactionId: txnResult.insertId }
    });
  } catch (error) {
    console.error('payVendor Error:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Assign Credit to Employee
 */
const assignCreditToEmployee = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employeeId, amount, reason } = req.body;
    const employerId = req.user.id;

    if (!amount || amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid amount.' });
    }

    // 1. Check Employer Balance
    const [employerRows] = await connection.query('SELECT id FROM employers WHERE user_id = ?', [req.user.id]);
    if (employerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employer not found' });
    }
    const empRecordId = employerRows[0].id;

    const [creditRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [empRecordId]);

    if (creditRows.length === 0 || creditRows[0].balance < amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient credit balance.' });
    }

    // 2. Deduct from Employer
    await connection.query('UPDATE credits SET balance = balance - ?, total_used = total_used + ? WHERE employer_id = ?', [amount, amount, empRecordId]);

    // 3. Log Transaction (Employer Debit)
    await connection.query(
      `INSERT INTO transactions(employer_id, user_id, amount, type, description, payment_method, date, created_at)
VALUES(?, ?, ?, 'debit', ?, 'Credit System', NOW(), NOW())`,
      [empRecordId, req.user.id, amount, `Credit assigned to Employee ID: ${employeeId}.Reason: ${reason} `]
    );

    // 4. Log Transaction (Employee Credit)
    const [empUser] = await connection.query('SELECT user_id FROM employees WHERE id = ?', [employeeId]);
    if (empUser.length === 0) {
      await connection.rollback();
      throw new Error('Employee not found');
    }
    const employeeUserId = empUser[0].user_id;

    await connection.query(
      `INSERT INTO transactions(employer_id, user_id, amount, type, description, payment_method, date, created_at)
VALUES(?, ?, ?, 'credit', ?, 'Employer Credit', NOW(), NOW())`,
      [empRecordId, employeeUserId, amount, `Credit received from Employer.Reason: ${reason} `]
    );

    // 5. Update Employee Credit Balance
    await connection.query('UPDATE employees SET credit_balance = credit_balance + ?, updated_at = NOW() WHERE user_id = ?', [amount, employeeUserId]);

    await connection.commit();
    res.json({ success: true, message: 'Credit assigned successfully.' });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get Employee Credit History
 */
const getEmployeeCreditHistory = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    // Verify ownership
    const [check] = await db.query('SELECT * FROM employees WHERE id = ? AND employer_id = (SELECT id FROM employers WHERE user_id = ?)', [employeeId, req.user.id]);
    if (check.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const employeeUserId = check[0].user_id;

    // Fetch credit transactions for this employee
    const [history] = await db.query(`
SELECT * FROM transactions 
      WHERE user_id = ? AND description LIKE 'Credit received%'
      ORDER BY date DESC
  `, [employeeUserId]);

    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

/**
 * Request More Credit
 */
const requestCredit = async (req, res, next) => {
  try {
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0.' });
    }

    const [empRows] = await db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employer profile not found.' });
    }
    const employer = empRows[0];

    await db.query(`
      INSERT INTO transactions (user_id, employer_id, type, amount, description, status, date, created_at, updated_at)
      VALUES (?, ?, 'credit', ?, ?, 'pending', NOW(), NOW(), NOW())
    `, [req.user.id, employer.id, amount, reason || 'Credit Request']);

    res.json({
      success: true,
      message: 'Credit request submitted successfully and is pending approval.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getJobApplications,
  updateApplicationStatus,
  getCreditBalance,
  getTransactions,
  getBeneficiaries,
  getCreditHistory,
  getTransactionChart,
  // Employee Management
  getMyEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  requestCredit,
  // Vendor Management
  getMyVendors,
  addVendor,
  updateVendor,
  // Attendance
  getEmployeeAttendance,
  markAttendance,
  // Training
  createTraining,
  getAllTrainings,
  assignTrainingToEmployees,
  // Payment
  paySalary,
  payVendor,
  // New Exports
  assignCreditToEmployee,
  getEmployeeCreditHistory
};

