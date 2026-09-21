
const db = require('../config/mysql');
const bcrypt = require('bcrypt');

/**
 * 1. Dashboard Summary (Optimized)
 */
const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // A. Basic Employee & User Info
    const [empRows] = await db.query(`
      SELECT e.*, u.name, u.email, u.phone, u.address, u.profile_image, 
             COALESCE(emp.company_name, c.company_name) as display_company_name
      FROM employees e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN employers emp ON e.employer_id = emp.id
      LEFT JOIN companies c ON e.company_id = c.id
      WHERE e.user_id = ?
    `, [userId]);
    const employee = empRows[0];

    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    // B. Salary Summary
    const [salaryRows] = await db.query(`
      SELECT 
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paidSalary,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pendingSalary,
        MAX(payment_date) as lastPaymentDate
      FROM salary_records WHERE employee_id = ?
    `, [employee.id]);
    const salarySummary = salaryRows[0];

    // C. Bills Summary
    const [billRows] = await db.query(`
      SELECT 
        COUNT(*) as totalBills,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingBills
      FROM bills WHERE employee_id = ?
    `, [employee.id]);

    // D. Attendance Summary (Current Month)
    const [attendanceRows] = await db.query(`
      SELECT 
        COUNT(*) as totalPresent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as totalLate
      FROM attendance 
      WHERE employee_id = ? 
      AND MONTH(date) = MONTH(CURRENT_DATE()) 
      AND YEAR(date) = YEAR(CURRENT_DATE())
    `, [employee.id]);

    // E. Training Count
    const [trainingRows] = await db.query(`
      SELECT COUNT(*) as count FROM training_enrollments WHERE employee_id = ? AND status != 'completed'
    `, [employee.id]);

    // F. Bank Status
    const [bankRows] = await db.query(`
      SELECT verification_status FROM bank_details WHERE employee_id = ? AND status = 'active' LIMIT 1
    `, [employee.id]);

    // G. Recent Transactions
    const [transactions] = await db.query(`
      SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      data: {
        profile: {
          id: employee.id,
          name: employee.name,
          designation: employee.designation,
          company: employee.display_company_name,
          profile_image: employee.profile_image,
          credit_balance: parseFloat(employee.credit_balance || 0)
        },
        salary: {
          paid: parseFloat(salarySummary.paidSalary || 0),
          pending: parseFloat(salarySummary.pendingSalary || 0),
          last_payment: salarySummary.lastPaymentDate
        },
        bills: {
          total: billRows[0].totalBills,
          pending: billRows[0].pendingBills
        },
        attendance: {
          present_this_month: attendanceRows[0].totalPresent,
          late_this_month: attendanceRows[0].totalLate
        },
        trainings: {
          assigned_count: trainingRows[0].count
        },
        bank: {
          verification_status: bankRows[0]?.verification_status || 'not_added'
        },
        recent_transactions: transactions
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2. Profile
 */
const getProfile = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT e.*, u.name, u.email, u.phone, u.address, u.profile_image, u.role,
             b.bank_name, b.account_number, b.ifsc_code, b.branch_name, b.account_type
      FROM employees e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN bank_details b ON e.id = b.employee_id AND b.is_primary = 1
      WHERE e.user_id = ?
    `, [req.user.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

const updateProfile = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { name, phone, address, profile_image, emergency_contact } = req.body;

    // Update USERS table
    const userUpdates = [];
    const userParams = [];
    if (name) { userUpdates.push("name = ?"); userParams.push(name); }
    if (phone) { userUpdates.push("phone = ?"); userParams.push(phone); }
    if (address) { userUpdates.push("address = ?"); userParams.push(address); }
    if (profile_image) { userUpdates.push("profile_image = ?"); userParams.push(profile_image); }

    if (userUpdates.length > 0) {
      userParams.push(req.user.id);
      await connection.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, userParams);
    }

    // Update EMPLOYEES table
    if (emergency_contact) {
      await connection.query("UPDATE employees SET emergency_contact = ? WHERE user_id = ?", [emergency_contact, req.user.id]);
    }

    await connection.commit();
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
};

/**
 * 3. Wallet & Salary
 */
const getWallet = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id, credit_balance FROM employees WHERE user_id = ?", [req.user.id]);
    const [history] = await db.query(`
      SELECT * FROM credit_transactions 
      WHERE employee_id = ? 
      ORDER BY created_at DESC
    `, [emp[0].id]);
    res.json({
      success: true,
      data: {
        balance: parseFloat(emp[0].credit_balance || 0),
        history: history
      }
    });
  } catch (err) { next(err); }
};

const getSalaryHistory = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    if (emp.length === 0) return res.json({ success: true, data: [] });

    const [rows] = await db.query(`
      SELECT s.*, e.company_name as employer_name, u.name as employee_name
      FROM salary_records s
      JOIN employees emp_rec ON s.employee_id = emp_rec.id
      JOIN users u ON emp_rec.user_id = u.id
      LEFT JOIN employers e ON emp_rec.employer_id = e.id
      WHERE s.employee_id = ?
      ORDER BY s.year DESC, 
               CASE s.month 
                 WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3 
                 WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6 
                 WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9 
                 WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12 
               END DESC
    `, [emp[0].id]);

    const formattedRows = rows.map(r => {
      const gross = parseFloat(r.gross_salary || r.amount || 0);
      const pf = parseFloat(r.pf || 0);
      const tds = parseFloat(r.tds || 0);
      const profTax = parseFloat(r.professional_tax || 0);
      const totalDeductions = pf + tds + profTax;
      const net = parseFloat(r.net_salary || (gross - totalDeductions) || gross);

      return {
        ...r, // Keep original snake_case fields
        grossSalary: gross,
        netSalary: net,
        basicSalary: r.basic_salary,
        total_deductions: totalDeductions,
        gross_salary: gross,
        net_salary: net,
        basic_salary: r.basic_salary,
        paymentDate: r.payment_date,
        paymentMethod: r.payment_method,
      };
    });

    res.json({ success: true, data: formattedRows });
  } catch (err) { next(err); }
};

/**
 * 4. Bills & Payments
 */
const createBill = async (req, res, next) => {
  try {
    const { title, amount, description } = req.body;
    const [emp] = await db.query("SELECT id, employer_id FROM employees WHERE user_id = ?", [req.user.id]);
    if (emp.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });

    await db.query(`
      INSERT INTO bills (employee_id, employer_id, name, amount, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())
    `, [emp[0].id, emp[0].employer_id, title, amount, description]);

    res.json({ success: true, message: 'Bill created successfully' });
  } catch (err) { next(err); }
};

const payBill = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { billId } = req.body;
    const [empRows] = await connection.query("SELECT id, credit_balance, employer_id FROM employees WHERE user_id = ?", [req.user.id]);
    if (empRows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });
    const emp = empRows[0];
    const employeeId = emp.id;

    // 1. Get Bill Details
    const [billRows] = await connection.query("SELECT * FROM bills WHERE id = ? AND employee_id = ?", [billId, employeeId]);
    const bill = billRows[0];
    if (!bill) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }
    if (bill.status === 'paid') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Bill already paid' });
    }

    // 2. Check Balance
    if (parseFloat(emp.credit_balance || 0) < parseFloat(bill.amount)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // 3. Deduct Balance
    await connection.query("UPDATE employees SET credit_balance = credit_balance - ? WHERE id = ?", [bill.amount, employeeId]);

    // 4. Update Bill - Fixed column name from paid_at to paid_date
    await connection.query("UPDATE bills SET status = 'paid', paid_date = NOW(), updated_at = NOW() WHERE id = ?", [billId]);

    // 5. Record Transaction
    await connection.query(`
      INSERT INTO transactions (user_id, employer_id, type, amount, description, status, date, created_at, updated_at)
      VALUES (?, ?, 'bill_payment', ?, ?, 'success', NOW(), NOW(), NOW())
    `, [req.user.id, emp.employer_id, bill.amount, `Paid bill: ${bill.name || bill.bill_number}`]);

    await connection.commit();
    res.json({ success: true, message: 'Bill paid successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

const getBills = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    if (emp.length === 0) return res.json({ success: true, data: [] });

    const [rows] = await db.query(`
      SELECT b.*, b.name as company_name, b.paid_date as payment_date
      FROM bills b
      WHERE b.employee_id = ?
      ORDER BY b.created_at DESC
    `, [emp[0].id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/**
 * 5. Attendance
 */
const checkIn = async (req, res, next) => {
  try {
    const { location, notes } = req.body;
    const [emp] = await db.query("SELECT id, employer_id FROM employees WHERE user_id = ?", [req.user.id]);

    if (!emp.length) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Check if already checked in
    const [existing] = await db.query("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", [emp[0].id, today]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'Already checked in today' });

    // Mark as 'late' if after 10:00 AM (example) 
    // You can adjust this threshold
    const now = new Date();
    const isLate = now.getHours() >= 10;

    await db.query(`
      INSERT INTO attendance (employee_id, employer_id, user_id, date, check_in, status, location, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, NOW(), NOW())
    `, [emp[0].id, emp[0].employer_id, req.user.id, today, isLate ? 'late' : 'present', location || 'Office', notes || null]);

    res.json({ success: true, message: 'Checked in successfully' });
  } catch (err) {
    console.error('Check-in error:', err);
    next(err);
  }
};

const checkOut = async (req, res, next) => {
  try {
    const { location, notes } = req.body;
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);

    if (!emp.length) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [existing] = await db.query("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", [emp[0].id, today]);
    if (existing.length === 0) return res.status(400).json({ success: false, message: 'No check-in record found for today. Please check in first.' });
    if (existing[0].check_out) return res.status(400).json({ success: false, message: 'Already checked out today.' });

    // Calculate duration
    let checkInTime = existing[0].check_in;

    // If it's a string like "18:41:37", we need to combine it with current date
    if (typeof checkInTime === 'string' && checkInTime.includes(':')) {
      const todayStr = new Date().toISOString().split('T')[0];
      checkInTime = new Date(`${todayStr}T${checkInTime}`);
    } else {
      checkInTime = new Date(checkInTime);
    }

    const checkOutTime = new Date();

    if (isNaN(checkInTime.getTime())) {
      console.error('Invalid Check-In Time:', existing[0].check_in);
      return res.status(500).json({ success: false, message: 'Internal error: Invalid check-in time format.' });
    }

    const durationMs = checkOutTime - checkInTime;
    const hours = Math.max(0, (durationMs / (1000 * 60 * 60))).toFixed(2);

    await db.query(`
      UPDATE attendance SET 
        check_out = NOW(), 
        working_hours = ?, 
        total_hours = ?, 
        location = COALESCE(?, location),
        notes = COALESCE(?, notes),
        updated_at = NOW() 
      WHERE id = ?
    `, [hours, hours, location || null, notes || null, existing[0].id]);

    res.json({
      success: true,
      message: 'Checked out successfully',
      hours: hours
    });
  } catch (err) {
    console.error('Check-out error:', err.message);
    next(err);
  }
};

const getAttendance = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    if (!emp.length) return res.json({ success: true, data: [] });

    const [rows] = await db.query(`
      SELECT *, 
             DATE_FORMAT(date, '%Y-%m-%d') as date,
             DATE_FORMAT(check_in, '%h:%i %p') as check_in_time,
             DATE_FORMAT(check_out, '%h:%i %p') as check_out_time,
             IF(check_out IS NULL, '-', CONCAT(COALESCE(working_hours, '0.00'), ' hrs')) as duration,
             CONCAT(UCASE(LEFT(status, 1)), SUBSTRING(status, 2)) as status,
             CASE 
               WHEN TIME(check_in) > '10:00:00' THEN 
                 TIME_FORMAT(TIMEDIFF(TIME(check_in), '10:00:00'), '%Hh %im')
               ELSE 'On Time' 
             END as late_by
      FROM attendance 
      WHERE employee_id = ? 
      ORDER BY date DESC
    `, [emp[0].id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/**
 * 6. Training
 */
const getTrainings = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    const [rows] = await db.query(`
      SELECT te.id, te.status, te.test_score as score, te.created_at,
             c.title as course_title, c.title as name, c.description, c.start_date, c.end_date,
             c.trainer_name, c.duration, c.category
      FROM training_enrollments te
      JOIN training_courses c ON te.training_id = c.id
      WHERE te.employee_id = ?
      ORDER BY c.start_date DESC
    `, [emp[0].id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/**
 * 7. Tests & Certificates
 */
const getTests = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    const [rows] = await db.query(`
      SELECT te.id, te.id as enrollment_id, te.status, te.test_score as score,
             c.title as course_title, c.title as course_name,
             'Final Assessment' as test_title, 'Final Assessment' as name,
             c.end_date as test_date, '60 Mins' as duration, '20' as total_questions
      FROM training_enrollments te
      JOIN training_courses c ON te.training_id = c.id
      WHERE te.employee_id = ?
    `, [emp[0].id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const getCertificates = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    const [rows] = await db.query(`
      SELECT te.id, te.id as certificate_id, 'Generated' as certificate_url, te.updated_at as issue_date, 
             c.title as course_title, c.title as course_name
      FROM training_enrollments te
      JOIN training_courses c ON te.training_id = c.id
      WHERE te.employee_id = ? AND te.status = 'Completed'
    `, [emp[0].id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/**
 * 8. Bank Details
 */
const addBankDetails = async (req, res, next) => {
  try {
    // Handle both camelCase (from frontend) and snake_case (standard)
    const {
      bankName, bank_name,
      accountNumber, account_number,
      ifscCode, ifsc, ifsc_code,
      accountHolderName, account_holder_name,
      branchName, branch, branch_name,
      accountType, account_type,
      isPrimary, is_primary
    } = req.body;

    const [emp] = await db.query("SELECT id, employer_id FROM employees WHERE user_id = ?", [req.user.id]);
    if (emp.length === 0) return res.status(404).json({ success: false, message: 'Employee profile not found' });

    const final_bank_name = bankName || bank_name;
    const final_account_number = accountNumber || account_number;
    const final_ifsc = ifscCode || ifsc || ifsc_code;
    const final_branch = branchName || branch || branch_name;
    const final_account_holder = accountHolderName || account_holder_name;
    const final_account_type = accountType || account_type || 'Savings';
    const final_is_primary = (isPrimary !== undefined) ? (isPrimary ? 1 : 0) : (is_primary || 0);

    await db.query(`
      INSERT INTO bank_details (
        employee_id, employer_id, bank_name, account_number, ifsc_code, 
        account_holder_name, branch_name, account_type, 
        is_primary, status, verification_status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', NOW(), NOW())
    `, [
      emp[0].id, emp[0].employer_id, final_bank_name, final_account_number, final_ifsc,
      final_account_holder, final_branch, final_account_type, final_is_primary
    ]);

    res.json({ success: true, message: 'Bank details added. Awaiting verification.' });
  } catch (err) { next(err); }
};

/**
 * 9. Transactions
 */
const getTransactions = async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/**
 * 10. Job Applications
 */
const getMyApplications = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT ja.*, 
             j.title as job_title, j.location, j.salary_min, j.salary_max, 
             j.created_at as job_created_at, j.job_type, j.description as job_description,
             e.company_name
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN employers e ON j.employer_id = e.id
      WHERE ja.jobseeker_id = ?
      ORDER BY ja.applied_at DESC
    `, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const getAllJobs = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT j.*, e.company_name
      FROM jobs j
      JOIN employers e ON j.employer_id = e.id
      WHERE j.status = 'Active'
      AND j.id NOT IN (
        SELECT job_id FROM job_applications WHERE jobseeker_id = ? AND status != 'Withdrawn'
      )
      ORDER BY j.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const applyForJob = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    // 1. Check Job Status
    const [jobRows] = await connection.query('SELECT status, applicants_count FROM jobs WHERE id = ?', [jobId]);
    if (jobRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (jobRows[0].status !== 'Active') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Job is no longer active' });
    }

    // 2. Check Duplicate
    const [existing] = await connection.query(
      "SELECT id FROM job_applications WHERE job_id = ? AND jobseeker_id = ? AND status != 'Withdrawn'",
      [jobId, userId]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Already applied for this job' });
    }

    // 3. Get User Details
    const [userRows] = await connection.query('SELECT name, email, phone FROM users WHERE id = ?', [userId]);
    const user = userRows[0];

    const { cover_letter, resume_id, experience, skills, education, phone } = req.body;

    // 4. Get Resume Path
    let resumePath = null;
    if (resume_id) {
      const [resRows] = await connection.query('SELECT file_path FROM resumes WHERE id = ? AND user_id = ?', [resume_id, userId]);
      if (resRows.length > 0) resumePath = resRows[0].file_path;
    }

    // 5. Create Application
    await connection.query(`
            INSERT INTO job_applications (
                job_id, jobseeker_id, status, applied_at, 
                applicant_name, email, phone, resume, cover_letter,
                experience, skills, education,
                created_at, updated_at
            ) VALUES (?, ?, 'Under Review', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
      jobId, userId, user.name, user.email, phone || user.phone,
      resumePath, cover_letter || null, experience || null, skills || null, education || null
    ]);

    // 5. Increment Count
    await connection.query('UPDATE jobs SET applicants_count = applicants_count + 1 WHERE id = ?', [jobId]);

    await connection.commit();
    res.json({ success: true, message: 'Application submitted successfully' });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
};

const getBankDetails = async (req, res, next) => {
  try {
    const [emp] = await db.query("SELECT id FROM employees WHERE user_id = ?", [req.user.id]);
    const [rows] = await db.query("SELECT * FROM bank_details WHERE employee_id = ?", [emp[0].id]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  getWallet,
  getSalaryHistory,
  createBill,
  payBill,
  getBills,
  checkIn,
  checkOut,
  getAttendance,
  getTrainings,
  getTests,
  getCertificates,
  addBankDetails,
  getBankDetails,
  getTransactions,
  getMyApplications,
  getAllJobs,
  applyForJob
};
