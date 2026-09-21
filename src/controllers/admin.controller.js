const db = require('../config/mysql'); // Pure MySQL pool
const paymentService = require('../services/payment.service');
const bcrypt = require('bcrypt');


/**
 * Get Admin Dashboard Data
 */
const getDashboard = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;

    // Filter by admin's company
    const [empCount] = await db.query('SELECT COUNT(*) as count FROM employers WHERE company_id = ?', [adminCompanyId]);
    const [employeeCount] = await db.query('SELECT COUNT(*) as count FROM employees emp JOIN employers e ON emp.company_id = e.id WHERE e.company_id = ?', [adminCompanyId]);
    const [vendorCount] = await db.query('SELECT COUNT(*) as count FROM vendors v JOIN users u ON v.user_id = u.id WHERE u.company_id = ?', [adminCompanyId]);
    const [activeEmployerCount] = await db.query("SELECT COUNT(*) as count FROM employers WHERE status = 'active' AND company_id = ?", [adminCompanyId]);

    res.json({
      success: true,
      data: {
        summary: {
          totalEmployers: empCount[0].count,
          totalEmployees: employeeCount[0].count,
          totalVendors: vendorCount[0].count,
          activeEmployers: activeEmployerCount[0].count,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Dashboard Summary (with credits)
 */
const getDashboardSummary = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;

    if (!adminCompanyId) {
      return res.status(403).json({
        success: false,
        message: 'Admin is not assigned to any company.',
      });
    }

    // Helper function to safely query tables
    const safeQuery = async (query, params = [], defaultValue = [{ total: 0, active: 0 }]) => {
      try {
        const [result] = await db.query(query, params);
        return result;
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
          console.warn(`⚠️  Table missing: ${error.sqlMessage}`);
          return defaultValue;
        }
        throw error;
      }
    };

    // Credits Statistics (Sum of credits for employers belonging to this company)
    const creditStats = await safeQuery(
      `SELECT SUM(c.total_added) as total_added, SUM(c.balance) as total_balance 
       FROM credits c 
       JOIN employers e ON c.employer_id = e.id 
       WHERE e.company_id = ?`,
      [adminCompanyId],
      [{ total_added: 0, total_balance: 0 }]
    );

    // Transaction Statistics (Transactions for employers belonging to this company)
    const txnStats = await safeQuery(
      `SELECT COUNT(*) as count 
       FROM transactions t
       JOIN employers e ON t.employer_id = e.id
       WHERE e.company_id = ?`,
      [adminCompanyId],
      [{ count: 0 }]
    );

    const recentTxn = await safeQuery(
      `SELECT COUNT(*) as count 
       FROM transactions t
       JOIN employers e ON t.employer_id = e.id
       WHERE e.company_id = ? AND DATE(t.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [adminCompanyId],
      [{ count: 0 }]
    );

    // Employer & Employee Statistics
    const empStats = await safeQuery(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active 
       FROM employers 
       WHERE company_id = ?`,
      [adminCompanyId]
    );

    const employeeStats = await safeQuery(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active 
       FROM employees 
       WHERE company_id = ?`,
      [adminCompanyId]
    );

    // Vendor Statistics
    const vendorStats = await safeQuery(
      `SELECT COUNT(*) as total FROM vendors WHERE company_id = ?`,
      [adminCompanyId],
      [{ total: 0 }]
    );

    // Job Portal Statistics
    const jobStats = await safeQuery(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN j.status = "Active" THEN 1 END) as active 
       FROM jobs j
       JOIN employers e ON j.employer_id = e.id
       WHERE e.company_id = ?`,
      [adminCompanyId]
    );

    const seekerStats = await safeQuery(
      'SELECT COUNT(*) as total FROM users WHERE role = "jobseeker"',
      [],
      [{ total: 0 }]
    );

    // Training Statistics (assuming training_courses are global or company-specific?)
    // If they have an employer_id, we can filter. Let's check schema.
    const trainingStats = await safeQuery(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN tc.status = "ongoing" THEN 1 END) as ongoing 
       FROM training_courses tc
       JOIN employers e ON tc.employer_id = e.id
       WHERE e.company_id = ?`,
      [adminCompanyId]
    );

    // Bill Companies Statistics (Assuming they are global or linked to employers)
    const billCompanyStats = await safeQuery(
      'SELECT COUNT(*) as total, COUNT(CASE WHEN status = "pending" THEN 1 END) as active FROM billing_companies WHERE company_id = ?',
      [adminCompanyId]
    );

    // Payment Setup Statistics (using payment_setups table)
    const gatewayStats = await safeQuery(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN ps.active = 1 THEN 1 END) as active 
       FROM payment_setups ps
       JOIN employers e ON ps.company_id = e.id
       WHERE e.company_id = ?`,
      [adminCompanyId],
      [{ total: 0, active: 0 }]
    );

    const bankStats = await safeQuery(
      `SELECT COUNT(*) as total 
       FROM bank_details bd
       JOIN employees emp ON bd.employee_id = emp.id
       WHERE emp.company_id = ?`,
      [adminCompanyId],
      [{ total: 0, verified: 0 }]
    );

    // Subscription Statistics (for the company itself)
    const subStats = await safeQuery(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN status = "active" THEN 1 END) as active 
       FROM subscriptions 
       WHERE employer_id IN (SELECT id FROM employers WHERE company_id = ?)`,
      [adminCompanyId]
    );

    res.json({
      success: true,
      data: {
        // Credits
        totalCreditsAdded: parseFloat(creditStats[0]?.total_added || 0),
        creditsAssigned: parseFloat(creditStats[0]?.total_balance || 0),

        // Transactions
        totalTransactions: txnStats[0]?.count || 0,
        recentTransactions: recentTxn[0]?.count || 0,

        // Employers
        totalEmployers: empStats[0]?.total || 0,
        activeEmployers: empStats[0]?.active || 0,

        // Employees
        totalEmployees: employeeStats[0]?.total || 0,
        activeEmployees: employeeStats[0]?.active || 0,

        // Vendors
        totalVendors: vendorStats[0]?.total || 0,

        // Job Portal
        totalJobs: jobStats[0]?.total || 0,
        activeJobs: jobStats[0]?.active || 0,
        totalJobSeekers: seekerStats[0]?.total || 0,

        // Training
        totalTrainings: trainingStats[0]?.total || 0,
        ongoingTrainings: trainingStats[0]?.ongoing || 0,

        // Bill Companies
        totalBillCompanies: billCompanyStats[0]?.total || 0,
        activeBillCompanies: billCompanyStats[0]?.active || 0,

        // Payment Setup
        totalPaymentGateways: gatewayStats[0]?.total || 0,
        activePaymentGateways: gatewayStats[0]?.active || 0,
        totalBankAccounts: bankStats[0]?.total || 0,
        verifiedBankAccounts: bankStats[0]?.verified || 0,

        // Subscriptions
        totalSubscriptions: subStats[0]?.total || 0,
        activeSubscriptions: subStats[0]?.active || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Employers with Credit Info
 */
/**
 * Get Employers with Credit Info (Created by current admin)
 */
const getEmployers = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const adminCompanyId = req.user.company_id;

    // Build Query
    let sql = `
      SELECT e.*, 
             u.name as u_name, u.email as u_email, u.phone as u_phone, u.status as u_status, u.company_id as u_company_id, u.created_at as u_created_at,
             c.balance as credit_balance, c.total_added as credit_total_added
      FROM employers e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN credits c ON e.id = c.employer_id
      WHERE u.company_id = ?
    `;
    const params = [adminCompanyId];

    if (adminCompanyId) {
      sql += ' AND u.company_id = ? AND u.role = ?';
      params.push(adminCompanyId, 'employer');
    } else {
      sql += ' AND u.role = ?';
      params.push('employer');
    }

    sql += ' ORDER BY e.created_at DESC';

    const [rows] = await db.query(sql, params);

    // Fetch Payment Setups
    let paymentSetupsMap = {};
    if (rows.length > 0) {
      const empIds = rows.map(r => r.id);
      const [setupRows] = await db.query(`SELECT * FROM payment_setups WHERE company_id IN (?)`, [empIds]);
      setupRows.forEach(ps => {
        if (!paymentSetupsMap[ps.company_id]) paymentSetupsMap[ps.company_id] = [];
        paymentSetupsMap[ps.company_id].push(ps);
      });
    }

    const employersResult = rows.map(row => ({
      id: row.id,
      user: {
        id: row.user_id,
        name: row.u_name,
        email: row.u_email,
        phone: row.u_phone,
        status: row.u_status,
        company_id: row.u_company_id,
        created_at: row.u_created_at
      },
      company_name: row.company_name,
      company_address: row.company_address,
      gst_number: row.gst_number,
      pan_number: row.pan_number,
      subscription_plan: row.subscription_plan,
      designation: row.designation,
      status: row.status,
      // Ensure balance is a number
      credit: {
        balance: row.credit_balance !== null ? parseFloat(row.credit_balance) : 0,
        total_added: row.credit_total_added !== null ? parseFloat(row.credit_total_added) : 0
      },
      paymentSetups: paymentSetupsMap[row.id] || [],
      created_at: row.created_at,
    }));

    res.json({ success: true, data: employersResult });
  } catch (error) {
    next(error);
  }
};

// Deprecated/Removed Sequelize function
// const getEmployees = async (req, res, next) => { ... }

// Get single employer by id (full details)
// Get single employer by id (full details)
const getEmployerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Main query - JOIN credits to get balance
    const [rows] = await db.query(`
      SELECT e.*, 
             u.name as u_name, u.email as u_email, u.phone as u_phone, u.status as u_status, u.created_at as u_created_at,
             c.balance as credit_balance
      FROM employers e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN credits c ON e.id = c.employer_id
      WHERE e.id = ?
    `, [id]);

    const emp = rows[0];

    if (!emp) return res.status(404).json({ success: false, message: 'Employer not found.' });

    // Fetch related array info
    const [paymentSetups] = await db.query('SELECT * FROM payment_setups WHERE company_id = ?', [id]);
    const [creditTransactions] = await db.query('SELECT * FROM credit_transactions WHERE employer_id = ?', [id]);

    // Extract bank details for form pre-fill
    let bankDetails = {};
    const bankSetup = paymentSetups.find(p => p.provider === 'bank_transfer');
    if (bankSetup && bankSetup.config) {
      try {
        const config = typeof bankSetup.config === 'string' ? JSON.parse(bankSetup.config) : bankSetup.config;
        bankDetails = config; // { bank_name, account_number, ifsc_code... }
      } catch (e) { }
    }

    // Construct response
    const result = {
      ...emp,
      user: {
        id: emp.user_id,
        name: emp.u_name,
        email: emp.u_email,
        phone: emp.u_phone,
        status: emp.u_status,
        created_at: emp.u_created_at
      },
      // Ensure balance is mapped correctly
      balance: emp.credit_balance ? parseFloat(emp.credit_balance) : 0,
      // Spread bank details for frontend form
      ...bankDetails,
      paymentSetups,
      // cleanup flat fields
      u_name: undefined, u_email: undefined, u_phone: undefined, u_status: undefined, u_created_at: undefined, credit_balance: undefined
    };

    res.json({ success: true, data: result });
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
    const adminCompanyId = req.user.company_id;
    const [transactions] = await db.query(`
      SELECT t.*, e.company_name as employer_name
      FROM transactions t
      JOIN employers e ON t.employer_id = e.id
      WHERE e.company_id = ?
      ORDER BY t.created_at DESC
    `, [adminCompanyId]);

    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Transactions API Error:', error);
    next(error);
  }
};

const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM transactions WHERE id = ?', [id]);
    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * CRUD Operations for Employers
 */
const createEmployer = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { name, email, password, company_name, company_address, gst_number, pan_number, phone,
      bank_name, account_number, ifsc_code, branch } = req.body;
    // console.log(req.body)

    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists.',
      });
    }

    const adminCompanyId = req.user?.company_id || null;
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const [userResult] = await connection.query(
      `INSERT INTO users(name, email, password, phone, role, company_id, status, created_at, updated_at)
    VALUES(?, ?, ?, ?, 'employer', ?, 'active', NOW(), NOW())`,
      [name, email, hashedPassword, phone || null, adminCompanyId]
    );
    const userId = userResult.insertId;

    // Create Employer
    const [employerResult] = await connection.query(
      `INSERT INTO employers(user_id, company_id, designation, company_name, company_address, pan_number, gst_number, subscription_plan, created_by, status, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [userId, adminCompanyId, 'Manager', company_name || name, company_address, pan_number, gst_number, req.body.level || req.body.subscription_plan || 'Basic', req.user.id]
    );
    const employerId = employerResult.insertId;

    // Create Payment Setup (Bank Details) if provided
    if (bank_name || account_number || ifsc_code || branch) {
      const config = JSON.stringify({ bank_name, account_number, ifsc_code, branch, pan_number, gst_number });
      await connection.query(
        `INSERT INTO payment_setups(company_id, provider, config, active, created_by, created_at, updated_at)
         VALUES(?, 'bank_transfer', ?, 1, ?, NOW(), NOW())`,
        [employerId, config, req.user.id]
      );
    }

    // Create Initial Credit Record
    const initialBalance = parseFloat(req.body.balance) || 0;
    await connection.query(
      'INSERT INTO credits (employer_id, balance, total_added, total_used) VALUES (?, ?, ?, 0)',
      [employerId, initialBalance, initialBalance]
    );

    // Track Initial Balance in Transactions if > 0
    if (initialBalance > 0) {
      await connection.query(
        `INSERT INTO transactions (employer_id, user_id, amount, type, description, payment_method, date, created_at)
         VALUES (?, ?, ?, 'credit', 'Initial Balance', 'Admin', NOW(), NOW())`,
        [employerId, req.user.id, initialBalance]
      );
    }

    await connection.commit();

    // Prepare response data
    res.status(201).json({
      success: true,
      message: 'Employer created successfully.',
      data: {
        id: employerId,
        user: {
          id: userId,
          name,
          email,
        },
        credit: { balance: 0 }
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const getAllEmployers = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    // Similar query to getEmployers using JOINs
    const sql = `
      SELECT e.*,
      u.name as u_name, u.email as u_email, u.phone as u_phone, u.status as u_status, u.created_at as u_created_at,
      c.balance as credit_balance, c.total_added as credit_total_added,
      w.balance as wallet_balance
      FROM employers e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN credits c ON e.id = c.employer_id
      LEFT JOIN employer_wallets w ON e.id = w.employer_id
      WHERE u.company_id = ?
      ORDER BY e.created_at DESC
    `;
    const [rows] = await db.query(sql, [adminCompanyId]);

    // Map payment setups separately if needed or just skip for 'All' collection if performance heavy
    // Let's do map with IDs
    let paymentSetupsMap = {};
    if (rows.length > 0) {
      const empIds = rows.map(r => r.id);
      const [setupRows] = await db.query(`SELECT * FROM payment_setups WHERE company_id IN(?)`, [empIds]);
      setupRows.forEach(ps => {
        if (!paymentSetupsMap[ps.company_id]) paymentSetupsMap[ps.company_id] = [];
        paymentSetupsMap[ps.company_id].push(ps);
      });
    }

    const employers = rows.map(row => ({
      id: row.id,
      user: {
        id: row.user_id,
        name: row.u_name,
        email: row.u_email,
        phone: row.u_phone,
        status: row.u_status,
        created_at: row.u_created_at
      },
      company_name: row.company_name,
      company_address: row.company_address,
      gst_number: row.gst_number,
      pan_number: row.pan_number,
      subscription_plan: row.subscription_plan,
      status: row.status,
      credit: row.credit_balance !== null ? { balance: row.credit_balance, total_added: row.credit_total_added } : null,
      wallet: row.wallet_balance !== null ? { balance: row.wallet_balance } : null,
      paymentSetups: paymentSetupsMap[row.id] || [],
      created_at: row.created_at,
    }));

    res.json({
      success: true,
      data: employers,
    });
  } catch (error) {
    next(error);
  }
};

const updateEmployer = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id } = req.params;
    const { company_name, company_address, gst_number, pan_number, status, name, email, phone,
      bank_name, account_number, ifsc_code, branch } = req.body;


    // Check employer
    const [empRows] = await connection.query('SELECT * FROM employers WHERE id = ?', [id]);
    const employer = empRows[0];
    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employer not found.' });
    }

    // Update Employer fields
    const empUpdates = [];
    const empParams = [];
    if (company_name !== undefined) { empUpdates.push('company_name = ?'); empParams.push(company_name); }
    if (company_address !== undefined) { empUpdates.push('company_address = ?'); empParams.push(company_address); }
    if (gst_number !== undefined) { empUpdates.push('gst_number = ?'); empParams.push(gst_number); }
    if (pan_number !== undefined) { empUpdates.push('pan_number = ?'); empParams.push(pan_number); }
    if (status !== undefined) { empUpdates.push('status = ?'); empParams.push(status); }
    const level = req.body.level || req.body.subscription_plan;
    if (level !== undefined) { empUpdates.push('subscription_plan = ?'); empParams.push(level); }

    if (empUpdates.length > 0) {
      empParams.push(id);
      await connection.query(`UPDATE employers SET ${empUpdates.join(', ')} WHERE id = ? `, empParams);
    }

    // Update User fields
    if (name || email || phone) {
      const userUpdates = [];
      const userParams = [];
      if (name !== undefined) { userUpdates.push('name = ?'); userParams.push(name); }
      if (email !== undefined) { userUpdates.push('email = ?'); userParams.push(email); }
      if (phone !== undefined) { userUpdates.push('phone = ?'); userParams.push(phone); }

      if (userUpdates.length > 0) {
        userParams.push(employer.user_id);
        await connection.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ? `, userParams);
      }
    }

    // Update/Create Payment Setup
    if (bank_name || account_number || ifsc_code || branch) {
      const [psRows] = await connection.query("SELECT * FROM payment_setups WHERE company_id = ? AND provider = 'bank_transfer'", [id]);
      const existing = psRows[0];
      const config = JSON.stringify({
        bank_name: bank_name || '',
        account_number: account_number || '',
        ifsc_code: ifsc_code || '',
        branch: branch || ''
      });

      if (existing) {
        await connection.query('UPDATE payment_setups SET config = ? WHERE id = ?', [config, existing.id]);
      } else {
        const createdBy = req.user && req.user.id ? req.user.id : 1;
        await connection.query(
          `INSERT INTO payment_setups(company_id, provider, config, active, created_by, created_at, updated_at)
           VALUES(?, 'bank_transfer', ?, 1, ?, NOW(), NOW())`,
          [id, config, createdBy] // Use safe createdBy
        );
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'Employer updated successfully.' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Update Employer Error:', error);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const deleteEmployer = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;

    const [empRows] = await connection.query('SELECT user_id FROM employers WHERE id = ?', [id]);
    if (empRows.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Employer not found.' });
    }
    const userId = empRows[0].user_id;

    // Disable FK checks to force delete
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.beginTransaction();

    await connection.query('DELETE FROM employers WHERE id = ?', [id]);
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    await connection.commit();
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    res.json({ success: true, message: 'Employer deleted successfully.' });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    console.error('Delete Employer Error:', error);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// Add credit to employer (create or increment)
// Add credit to employer (create or increment)
const addCredit = async (req, res, next) => {
  try {
    const { id } = req.params; // employer id
    const { amount } = req.body;

    if (amount === undefined || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    }

    const [empRows] = await db.query('SELECT id FROM employers WHERE id = ?', [id]);
    if (empRows.length === 0) return res.status(404).json({ success: false, message: 'Employer not found.' });
    const employer = empRows[0];

    // Check credit record
    const [creditRows] = await db.query('SELECT * FROM credits WHERE employer_id = ?', [employer.id]);
    const amt = parseFloat(amount);

    console.log(`[AddCredit] Adding ${amt} to Employer ${employer.id}`);

    let credit;
    if (creditRows.length > 0) {
      credit = creditRows[0];
      console.log(`[AddCredit] Found existing credit record: ${JSON.stringify(credit)}`);
      await db.query(
        'UPDATE credits SET balance = balance + ?, total_added = total_added + ? WHERE id = ?',
        [amt, amt, credit.id]
      );
      // Fetch updated
      const [updated] = await db.query('SELECT * FROM credits WHERE id = ?', [credit.id]);
      credit = updated[0];
      console.log(`[AddCredit] Updated credit record: ${JSON.stringify(credit)}`);
    } else {
      console.log(`[AddCredit] No credit record found. Creating new.`);
      const [result] = await db.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used) VALUES (?, ?, ?, 0)',
        [employer.id, amt, amt]
      );
      const [newRows] = await db.query('SELECT * FROM credits WHERE id = ?', [result.insertId]);
      credit = newRows[0];
    }

    // Log Transaction
    await db.query(
      `INSERT INTO transactions (employer_id, user_id, amount, type, description, payment_method, transaction_id, date, created_at)
       VALUES (?, ?, ?, 'credit', ?, ?, ?, NOW(), NOW())`,
      [employer.id, req.user.id, amt, req.body.reference || 'Admin Credit Add', req.body.payment_method || 'Bank', req.body.transaction_id || '']
    );

    res.json({ success: true, message: 'Credit added successfully.', data: credit });
  } catch (error) {
    next(error);
  }
};

/**
 * Add Credit Bulk
 */
const addCreditBulk = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employer_ids, amount, reference, payment_mode, transaction_id } = req.body;

    if (!employer_ids || !Array.isArray(employer_ids) || employer_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Employer IDs array required.' });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive amount required.' });
    }

    for (const empId of employer_ids) {
      // Update Credit
      const [creditRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [empId]);

      if (creditRows.length > 0) {
        await connection.query(
          'UPDATE credits SET balance = balance + ?, total_added = total_added + ? WHERE id = ?',
          [amt, amt, creditRows[0].id]
        );
      } else {
        await connection.query(
          'INSERT INTO credits (employer_id, balance, total_added, total_used) VALUES (?, ?, ?, 0)',
          [empId, amt, amt]
        );
      }

      // Log Transaction
      await connection.query(
        `INSERT INTO transactions (employer_id, user_id, amount, type, description, payment_method, transaction_id, date, created_at)
         VALUES (?, ?, ?, 'credit', ?, ?, ?, NOW(), NOW())`,
        [empId, req.user.id, amt, reference || 'Bulk Credit Add', payment_mode || 'Bank', transaction_id || '']
      );
    }

    await connection.commit();
    res.json({ success: true, message: `Credits added to ${employer_ids.length} employers.` });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};




/**
 * CRUD Operations for Employees
 */
/**
 * CRUD Operations for Employees
 */
const createEmployee = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { name, email, password, employer_id, designation, salary } = req.body;

    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      `INSERT INTO users(name, email, password, role, status, created_at, updated_at)
    VALUES(?, ?, ?, 'employee', 'active', NOW(), NOW())`,
      [name, email, hashedPassword]
    );
    const userId = userResult.insertId;

    const [empResult] = await connection.query(
      `INSERT INTO employees(user_id, company_id, designation, salary, status, created_at, updated_at)
    VALUES(?, ?, ?, ?, 'active', NOW(), NOW())`,
      [userId, employer_id, designation, salary]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      data: {
        id: empResult.insertId,
        user: {
          id: userId,
          name,
          email,
        },
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const getAllEmployees = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [employees] = await db.query(`
      SELECT emp.*, u.name as u_name, u.email as u_email, u.status as u_status,
      e.company_name
      FROM employees emp
      JOIN users u ON emp.user_id = u.id
      LEFT JOIN companies e ON emp.company_id = e.id
      WHERE emp.company_id = ?
      ORDER BY emp.created_at DESC
    `, [adminCompanyId]);

    const formatted = employees.map(emp => ({
      id: emp.id,
      user_id: emp.user_id,
      company_id: emp.company_id,
      designation: emp.designation,
      salary: emp.salary,
      status: emp.status,
      created_at: emp.created_at,
      updated_at: emp.updated_at,
      user: {
        id: emp.user_id,
        name: emp.u_name,
        email: emp.u_email,
        status: emp.u_status
      },
      employer: emp.company_id ? {
        id: emp.company_id,
        company_name: emp.company_name
      } : null
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { designation, salary, status } = req.body;

    const [rows] = await db.query('SELECT * FROM employees WHERE id = ?', [id]);
    const employee = rows[0];

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.',
      });
    }

    const updates = [];
    const params = [];
    if (designation !== undefined) { updates.push('designation = ?'); params.push(designation); }
    if (salary !== undefined) { updates.push('salary = ?'); params.push(salary); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = ? `, params);
    }

    // Fetch updated
    const [updated] = await db.query('SELECT * FROM employees WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Employee updated successfully.',
      data: updated[0],
    });
  } catch (error) {
    next(error);
  }
};

const deleteEmployee = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id } = req.params;

    const [rows] = await connection.query('SELECT user_id FROM employees WHERE id = ?', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const userId = rows[0].user_id;

    await connection.query('DELETE FROM employees WHERE id = ?', [id]);
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
 * CRUD Operations for Vendors
 */
/**
 * CRUD Operations for Vendors
 */
const createVendor = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { name, email, password, company_name, services } = req.body;

    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      `INSERT INTO users(name, email, password, role, status, created_at, updated_at)
    VALUES(?, ?, ?, 'vendor', 'active', NOW(), NOW())`,
      [name, email, hashedPassword]
    );
    const userId = userResult.insertId;

    const [vendorResult] = await connection.query(
      `INSERT INTO vendors(user_id, company_name, service_type, payment_status, created_at, updated_at)
    VALUES(?, ?, ?, 'pending', NOW(), NOW())`, // assuming default payment status
      [userId, company_name, services]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully.',
      data: {
        id: vendorResult.insertId,
        user: {
          id: userId,
          name,
          email,
        },
        company_name,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const getAllVendors = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [vendors] = await db.query(`
      SELECT v.*, u.name as u_name, u.email as u_email, u.status as u_status
      FROM vendors v
      JOIN users u ON v.user_id = u.id
      WHERE v.company_id = ?
      ORDER BY v.created_at DESC
    `, [adminCompanyId]);

    const formatted = vendors.map(v => ({
      ...v,
      user: {
        id: v.user_id,
        name: v.u_name,
        email: v.u_email,
        status: v.u_status
      },
      u_name: undefined, u_email: undefined, u_status: undefined
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

const updateVendor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { company_name, services, payment_status } = req.body;

    const [rows] = await db.query('SELECT * FROM vendors WHERE id = ?', [id]);
    const vendor = rows[0];

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.',
      });
    }

    const updates = [];
    const params = [];
    if (company_name !== undefined) { updates.push('company_name = ?'); params.push(company_name); }
    if (services !== undefined) { updates.push('service_type = ?'); params.push(services); }
    if (payment_status !== undefined) { updates.push('payment_status = ?'); params.push(payment_status); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE vendors SET ${updates.join(', ')} WHERE id = ? `, params);
    }

    const [updated] = await db.query('SELECT * FROM vendors WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Vendor updated successfully.',
      data: updated[0],
    });
  } catch (error) {
    next(error);
  }
};

const deleteVendor = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id } = req.params;

    const [rows] = await connection.query('SELECT user_id FROM vendors WHERE id = ?', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }
    const userId = rows[0].user_id;

    await connection.query('DELETE FROM vendors WHERE id = ?', [id]);
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    await connection.commit();

    res.json({
      success: true,
      message: 'Vendor deleted successfully.',
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * ==================== PLAN PURCHASE & SUBSCRIPTION (ADMIN) - PURE SQL ====================
 */

/**
 * Purchase Plan
 */
/**
 * Purchase Plan (Refactored with Mock Gateway + Audit)
 */
const purchasePlan = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { plan_id, payment_method } = req.body;
    const adminId = req.user.id;
    const ipAddress = req.ip;

    // 1. Get Employer
    let employerId = req.user.company_id;
    let employer = null;
    if (employerId) {
      const [empRows] = await connection.query('SELECT * FROM employers WHERE id = ?', [employerId]);
      if (empRows.length > 0) employer = empRows[0];
    } else {
      const [adminRows] = await connection.query('SELECT id FROM admins WHERE user_id = ?', [adminId]);
      if (adminRows.length > 0) {
        const [empRows] = await connection.query('SELECT * FROM employers WHERE admin_id = ?', [adminRows[0].id]);
        if (empRows.length > 0) employer = empRows[0];
      }
    }

    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Company not found for this admin.' });
    }

    // 2. Get Plan
    const [planRows] = await connection.query('SELECT * FROM plans WHERE id = ? AND is_active = 1', [plan_id]);
    const plan = planRows[0];
    if (!plan) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Plan not found or inactive.' });
    }

    // 3. Initiate Payment (Mock Gateway)
    const currency = 'USD'; // Default for now
    const amount = parseFloat(plan.price);
    const intent = await paymentService.createPaymentIntent(amount, currency);

    // 4. Verify Payment (Mocking user confirmation)
    const verification = await paymentService.verifyPayment(intent.transactionId);

    if (!verification.success) {
      await connection.query(
        'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
        [req.user.id, 'PAYMENT_FAILED', `Plan purchase failed for Plan ID ${plan_id}.Txn: ${intent.transactionId} `, ipAddress]
      );
      await connection.commit(); // Commit log
      return res.status(400).json({ success: false, message: 'Payment failed at gateway.' });
    }

    // 5. Create Invoice
    const invoiceNumber = `INV - ${Date.now()} -${employer.id} `;
    const [invDetails] = await connection.query(
      `INSERT INTO invoices(invoice_number, employer_id, plan_id, amount, tax_amount, total_amount, due_date, status, notes, created_at, updated_at)
    VALUES(?, ?, ?, ?, 0, ?, NOW(), 'paid', ?, NOW(), NOW())`,
      [invoiceNumber, employer.id, plan.id, amount, amount, `Plan purchase: ${plan.name} `]
    );
    const invoiceId = invDetails.insertId;

    // 6. Create Payment Record
    const [payDetails] = await connection.query(
      `INSERT INTO payments(invoice_id, employer_id, amount, payment_method, status, payment_date, transaction_id, created_at, updated_at)
    VALUES(?, ?, ?, ?, 'success', NOW(), ?, NOW(), NOW())`,
      [invoiceId, employer.id, amount, payment_method || 'credit_card', verification.transactionId]
    );

    // 7. Manage Subscription
    // Expire current active subscription
    await connection.query(
      "UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE employer_id = ? AND status = 'active'",
      [employer.id]
    );

    // Create new Subscription
    const startDate = new Date();
    const endDate = new Date(startDate);
    const months = plan.duration_months || 0;
    endDate.setMonth(endDate.getMonth() + months);

    const [subDetails] = await connection.query(
      `INSERT INTO subscriptions(employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
    VALUES(?, ?, ?, ?, 'active', 0, NOW(), NOW())`,
      [employer.id, plan.id, startDate, endDate]
    );
    const subscriptionId = subDetails.insertId;

    // Link subscription to invoice
    await connection.query('UPDATE invoices SET subscription_id = ? WHERE id = ?', [subscriptionId, invoiceId]);

    // Update employer current plan name
    await connection.query('UPDATE employers SET subscription_plan = ? WHERE id = ?', [plan.name, employer.id]);

    // 8. Audit Log
    await connection.query(
      'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [req.user.id, 'PLAN_PURCHASED', `Purchased plan ${plan.name} (${plan_id}).Transaction: ${verification.transactionId} `, ipAddress]
    );

    await connection.commit();

    const [newSub] = await connection.query('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId]);
    const [newPay] = await connection.query('SELECT * FROM payments WHERE id = ?', [payDetails.insertId]);

    res.json({
      success: true,
      message: 'Plan purchased successfully.',
      data: {
        subscription: newSub[0],
        payment: newPay[0],
        invoice: { id: invoiceId, invoice_number: invoiceNumber }
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get Current Admin's Subscription
 */
const getMySubscription = async (req, res, next) => {
  try {
    let employerId = req.user.company_id;

    // Logic to find employer if not directly on user
    if (!employerId) {
      const [adminRecords] = await db.query('SELECT id FROM admins WHERE user_id = ?', [req.user.id]);
      if (adminRecords.length > 0) {
        const [employers] = await db.query('SELECT id FROM employers WHERE admin_id = ?', [adminRecords[0].id]);
        if (employers.length > 0) employerId = employers[0].id;
      }
    }

    if (!employerId) return res.status(404).json({ success: false, message: 'Company not found.' });

    // Find active subscription with Plan details
    const [subs] = await db.query(`
      SELECT s.*, p.name as plan_name, p.price as plan_price, p.description as plan_desc 
      FROM subscriptions s
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE s.employer_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
      `, [employerId]);

    const subscription = subs.length > 0 ? subs[0] : null;

    // Format response to match expected structure (nested plan object)
    let data = null;
    if (subscription) {
      data = {
        ...subscription,
        plan: {
          name: subscription.plan_name,
          price: subscription.plan_price,
          description: subscription.plan_desc
        }
      };
    }

    res.json({
      success: true,
      data: data,
      message: data ? 'Active subscription found' : 'No active subscription'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Admin's Payment History
 */
const getMyPayments = async (req, res, next) => {
  try {
    let employerId = req.user.company_id;
    if (!employerId) {
      const [adminRecords] = await db.query('SELECT id FROM admins WHERE user_id = ?', [req.user.id]);
      if (adminRecords.length > 0) {
        const [employers] = await db.query('SELECT id FROM employers WHERE admin_id = ?', [adminRecords[0].id]);
        if (employers.length > 0) employerId = employers[0].id;
      }
    }

    if (!employerId) return res.status(404).json({ success: false, message: 'Company not found.' });

    const [payments] = await db.query(`
      SELECT pay.*, inv.invoice_number, p.name as plan_name
      FROM payments pay
      LEFT JOIN invoices inv ON pay.invoice_id = inv.id
      LEFT JOIN plans p ON inv.plan_id = p.id
      WHERE pay.employer_id = ?
      ORDER BY pay.created_at DESC
        `, [employerId]);

    // Format to nest invoice/plan if frontend expects it
    const formatted = payments.map(p => ({
      ...p,
      invoice: {
        invoice_number: p.invoice_number,
        plan: {
          name: p.plan_name
        }
      }
    }));

    res.json({ success: true, data: formatted });

  } catch (error) {
    next(error);
  }
};

/**
 * Get Subscription Status (Alias for getMySubscription)
 */
const getSubscriptionStatus = getMySubscription;

/**
 * ==================== JOB PORTAL MANAGEMENT (ADMIN) ====================
 */

/**
 * Get All Jobs (Admin View - All jobs from organization)
 */
const getAllJobs = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    if (!adminCompanyId) return res.status(400).json({ success: false, message: 'Admin company not found.' });

    // Get all employers under this company
    const [employers] = await db.query('SELECT id FROM employers WHERE company_id = ?', [adminCompanyId]); // employers table has company_id? yes based on createEmployer
    // Wait, createEmployer inserts into `employers` with `company_id`.
    // Wait, createEmployer uses `INSERT INTO employers(user_id, company_id...)`.
    // So yes, we can filter by company_id.

    // However, we can also join directly:
    // SELECT j.* FROM jobs j JOIN employers e ON j.employer_id = e.id WHERE e.company_id = ?

    const sql = `
      SELECT j.*, e.company_name as emp_company_name, u.name as posted_by_name
      FROM jobs j
      JOIN employers e ON j.employer_id = e.id
      JOIN users u ON e.user_id = u.id
      WHERE e.company_id = ?
      ORDER BY j.created_at DESC
    `;

    const [jobs] = await db.query(sql, [adminCompanyId]);

    // Format
    const formatted = jobs.map(j => ({
      ...j,
      employer: {
        id: j.employer_id,
        company_name: j.emp_company_name, // This might be "Manager's Department" or Company Name? usually Company Name
        manager_name: j.posted_by_name
      }
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Job (Admin)
 */
const createJob = async (req, res, next) => {
  try {
    const { title, description, employer_id, status, location, salary_min, salary_max, job_type, experience } = req.body;
    const adminCompanyId = req.user.company_id;

    if (!title || !employer_id) return res.status(400).json({ success: false, message: 'Title and Employer are required.' });

    // Verify employer belongs to admin's company
    const [empCheck] = await db.query('SELECT id FROM employers WHERE id = ? AND company_id = ?', [employer_id, adminCompanyId]);
    if (empCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid Employer ID (not in your organization).' });
    }

    // Insert Job
    const [result] = await db.query(
      `INSERT INTO jobs (employer_id, title, description, location, salary_min, salary_max, job_type, experience, status, posted_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [employer_id, title, description, location, salary_min, salary_max, job_type, experience, status || 'Active']
    );

    const [newJob] = await db.query('SELECT * FROM jobs WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Job posted successfully.', data: newJob[0] });

  } catch (error) {
    next(error);
  }
};

/**
 * Update Job (Admin)
 */
const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminCompanyId = req.user.company_id;

    // Verify job belongs to admin's company
    const [jobRows] = await db.query(`
      SELECT j.id 
      FROM jobs j 
      JOIN employers e ON j.employer_id = e.id 
      WHERE j.id = ? AND e.company_id = ?
    `, [id, adminCompanyId]);

    if (jobRows.length === 0) return res.status(404).json({ success: false, message: 'Job not found or permission denied.' });

    const updates = [];
    const params = [];
    const allowed = ['title', 'description', 'location', 'salary_min', 'salary_max', 'job_type', 'experience', 'status', 'requirements', 'benefits'];

    for (const key of Object.keys(req.body)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await db.query(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const [updated] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);
    res.json({ success: true, message: 'Job updated.', data: updated[0] });

  } catch (error) {
    next(error);
  }
};

/**
 * Delete Job (Admin)
 */
const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminCompanyId = req.user.company_id;

    // Verify job belongs to admin's company
    const [jobRows] = await db.query(`
      SELECT j.id 
      FROM jobs j 
      JOIN employers e ON j.employer_id = e.id 
      WHERE j.id = ? AND e.company_id = ?
    `, [id, adminCompanyId]);

    if (jobRows.length === 0) return res.status(404).json({ success: false, message: 'Job not found or permission denied.' });

    await db.query('DELETE FROM jobs WHERE id = ?', [id]);
    res.json({ success: true, message: 'Job deleted.' });

  } catch (error) {
    next(error);
  }
};



/**
 * ==================== ATTENDANCE MANAGEMENT (ADMIN) ====================
 */

/**
 * Get All Attendance (For Company)
 */
const getAttendance = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { date } = req.query;

    let sql = `
      SELECT a.*, emp.id as employee_id, u.name as employee_name, emp.designation, u.email as employee_email
      FROM attendance a
      JOIN employees emp ON a.employee_id = emp.id
      JOIN users u ON emp.user_id = u.id
      JOIN employers empyr ON emp.employer_id = empyr.id
      WHERE empyr.company_id = ?
    `;
    const params = [adminCompanyId];

    if (date) {
      sql += ' AND a.date = ?';
      params.push(date);
    }

    sql += ' ORDER BY a.date DESC, a.check_in ASC LIMIT 500';

    const [rows] = await db.query(sql, params);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark Attendance (Admin Override)
 */
const markAttendance = async (req, res, next) => {
  try {
    const { employeeId, date, status, check_in, check_out } = req.body;
    // Upsert attendance
    const [existing] = await db.query('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [employeeId, date]);

    // Calculate working hours if both provided
    let workingHours = null;
    if (check_in && check_out) {
      const t1 = new Date(`2000-01-01T${check_in}`);
      const t2 = new Date(`2000-01-01T${check_out}`);
      if (!isNaN(t1) && !isNaN(t2)) {
        workingHours = ((t2 - t1) / (1000 * 60 * 60)).toFixed(2);
      }
    }

    if (existing.length > 0) {
      await db.query(
        'UPDATE attendance SET status = ?, check_in = ?, check_out = ?, total_hours = ?, working_hours = ? WHERE id = ?',
        [status, check_in, check_out, workingHours, workingHours, existing[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO attendance (employee_id, date, status, check_in, check_out, total_hours, working_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [employeeId, date, status, check_in, check_out, workingHours, workingHours]
      );
    }

    res.json({ success: true, message: 'Attendance updated.' });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== TRAINING MANAGEMENT (ADMIN) ====================
 */

/**
 * Get Trainings
 */
const getTrainings = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    // Updated query to include enrolled and completed counts
    // Using V2 tables: training_courses, course_assignments
    const [trainings] = await db.query(`
      SELECT t.*, t.trainer_name as instructor,
        (SELECT COUNT(*) FROM course_assignments ta WHERE ta.training_id = t.id) as enrolled,
        (SELECT COUNT(*) FROM course_assignments ta WHERE ta.training_id = t.id AND ta.status = 'Completed') as completed
      FROM training_courses t
      JOIN employers e ON t.employer_id = e.id
      WHERE e.company_id = ?
      ORDER BY t.created_at DESC
    `, [adminCompanyId]);

    res.json({ success: true, data: trainings });
  } catch (error) {
    next(error);
  }
};



/**
 * Create Training
 */
const createTraining = async (req, res, next) => {
  try {
    const { title, description, start_date, end_date, employer_id, instructor, duration, category } = req.body;

    // If employer_id is not provided, try to find a default one for this admin (e.g. first employer)
    // or arguably, the admin should select an employer. For now, let's require it or pick one.
    // Ideally, the frontend should pick "My Company" or similar.
    // If not provided, we can fetch the first employer associated with this admin company
    let targetEmployerId = employer_id;
    if (!targetEmployerId) {
      const adminCompanyId = req.user.company_id;
      const [emps] = await db.query('SELECT id FROM employers WHERE company_id = ? LIMIT 1', [adminCompanyId]);
      if (emps.length > 0) targetEmployerId = emps[0].id;
    }

    // AUTO-FIX: If no employer exists, create a default one for this admin company
    if (!targetEmployerId) {
      const adminCompanyId = req.user.company_id;
      // Check if we can create a default employer
      const [result] = await db.query(
        'INSERT INTO employers (company_id, name, email, company_name, created_at) VALUES (?, ?, ?, ?, NOW())',
        [adminCompanyId, 'Default Employer', `default_${Date.now()}@company.com`, 'My Company']
      );
      targetEmployerId = result.insertId;
    }

    if (!targetEmployerId) return res.status(400).json({ success: false, message: 'Employer context required.' });

    const status = 'scheduled'; // Default status from enum: 'scheduled','ongoing','completed','cancelled'
    // trainings table has: trainer_name (alias instructor), duration, category
    await db.query(
      'INSERT INTO training_courses (employer_id, title, description, trainer_name, duration, category, start_date, end_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [targetEmployerId, title, description, instructor || null, duration || null, category || null, start_date || null, end_date || null, status]
    );

    res.json({ success: true, message: 'Training created successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign Training
 */
const assignTraining = async (req, res, next) => {
  try {
    const { trainingId, employeeIds, dueDate } = req.body; // employeeIds is array
    if (!employeeIds || !employeeIds.length) return res.status(400).json({ success: false, message: 'No employees selected.' });

    // Handle potential duplicate assignments
    // For simplicity, we can use INSERT IGNORE or replace, but raw SQL with VALUES ? is good.
    // We should probably check duplicates or just let it fail/ignore.

    const values = employeeIds.map(eid => [trainingId, eid, 'Assigned']);
    // Note: If using multiple values insert, ensure column order matches table
    // Columns: training_id, employee_id, status
    await db.query('INSERT INTO course_assignments (training_id, employee_id, status) VALUES ?', [values]);

    res.json({ success: true, message: 'Training assigned successfully.' });
  } catch (error) {
    // catch duplicate entry error?
    next(error);
  }
};

/**
 * Upload Training Material
 */
const uploadTrainingMaterial = async (req, res, next) => {
  try {
    // Assuming simple file record creation for now. File upload handling (multer) should happen in route.
    // Here we expect req.file or req.body to have file details.
    // Since we don't have S3/Multer setup code visible here, we'll assume the frontend/route handles upload 
    // and passes URL/Filename, OR we just store metadata if file upload is mocked/local.

    const { courseId, fileName } = req.body;
    // If we had a real file upload, we'd get the path from req.file.path or similar.
    const fileUrl = req.file ? req.file.path : 'mock_url_placeholder';
    const fileSize = req.file ? req.file.size : '0';
    const fileType = req.file ? req.file.mimetype : 'application/pdf';

    await db.query(
      'INSERT INTO course_materials (training_id, file_name, file_url, file_type, file_size, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [courseId, fileName, fileUrl, fileType, fileSize]
    );

    res.json({ success: true, message: 'Material uploaded successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Training Materials
 */
const getTrainingMaterials = async (req, res, next) => {
  try {
    const [materials] = await db.query(`
            SELECT tm.*, t.title as course_title 
            FROM course_materials tm
            JOIN training_courses t ON tm.training_id = t.id
            ORDER BY tm.uploaded_at DESC
        `);
    res.json({ success: true, data: materials });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark Training Completion
 */
const markTrainingCompletion = async (req, res, next) => {
  try {
    const { employeeId, courseId, score, status } = req.body;

    // Check if assignment exists
    const [existing] = await db.query('SELECT id FROM course_assignments WHERE training_id = ? AND employee_id = ?', [courseId, employeeId]);

    const certificateStatus = status === 'Completed' ? 'Generated' : 'Pending';

    if (existing.length > 0) {
      await db.query(`
                UPDATE course_assignments 
                SET status = ?, score = ?, completion_date = NOW(), certificate_status = ?
                WHERE id = ?
            `, [status, score, certificateStatus, existing[0].id]);
    } else {
      // Create new if not assigned previously
      await db.query(`
                INSERT INTO course_assignments (training_id, employee_id, status, score, completion_date, certificate_status, assigned_at)
                VALUES (?, ?, ?, ?, NOW(), ?, NOW())
            `, [courseId, employeeId, status, score, certificateStatus]);
    }

    res.json({ success: true, message: 'Completion marked.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Training Results
 */
const getTrainingResults = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [results] = await db.query(`
            SELECT ta.*, t.title as course_title, u.name as employee_name, e.designation
            FROM course_assignments ta
            JOIN training_courses t ON ta.training_id = t.id
            JOIN employers emp ON t.employer_id = emp.id
            JOIN employees e ON ta.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            WHERE emp.company_id = ?
            ORDER BY ta.completion_date DESC
        `, [adminCompanyId]);

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Training
 */
const deleteTraining = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Delete associated materials
    await db.query('DELETE FROM course_materials WHERE training_id = ?', [id]);

    // 2. Delete associated assignments
    await db.query('DELETE FROM course_assignments WHERE training_id = ?', [id]);

    // 3. Delete the training course itself
    const [result] = await db.query('DELETE FROM training_courses WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Training not found.' });
    }

    res.json({ success: true, message: 'Training deleted successfully.' });
  } catch (error) {
    console.error("Delete Training Error:", error);
    next(error);
  }
};

/**
 * Get Single Training
 */
const getTrainingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM training_courses WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Training not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Training
 */
const updateTraining = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, start_date, end_date, instructor, duration, category, status } = req.body;

    await db.query(`
      UPDATE training_courses 
      SET title=?, description=?, start_date=?, end_date=?, trainer_name=?, duration=?, category=?, status=?
      WHERE id=?
    `, [title, description, start_date, end_date, instructor, duration, category, status, id]);

    res.json({ success: true, message: 'Training updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== BILL COMPANY MANAGEMENT (ADMIN) ====================
 */

const getBillCompanies = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [companies] = await db.query('SELECT * FROM billing_companies WHERE company_id = ? ORDER BY created_at DESC', [adminCompanyId]);

    // Add billing_code if missing
    const formatted = companies.map(c => ({
      ...c,
      billing_code: c.billing_code || `BILL-${String(c.id).padStart(4, '0')}`
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

const createBillCompany = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { name, category, billingCode, level, status } = req.body;
    if (!name || !billingCode) return res.status(400).json({ success: false, message: 'Name and Billing Code required' });

    await db.query('INSERT INTO billing_companies (company_id, name, category, billing_code, level, status) VALUES (?, ?, ?, ?, ?, ?)',
      [adminCompanyId, name, category, billingCode, level, status || 'Active']);

    res.status(201).json({ success: true, message: 'Company added successfully' });
  } catch (error) {
    next(error);
  }
};

const updateBillCompany = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const { name, category, billingCode, level, status } = req.body;

    const [result] = await db.query('UPDATE billing_companies SET name=?, category=?, billing_code=?, level=?, status=? WHERE id=? AND company_id=?',
      [name, category, billingCode, level, status, id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Billing company not found or permission denied.' });
    }

    res.json({ success: true, message: 'Company updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteBillCompany = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM billing_companies WHERE id=? AND company_id=?', [id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Billing company not found or permission denied.' });
    }

    res.json({ success: true, message: 'Company deleted successfully' });
  } catch (error) {
    next(error);
  }
};



/**
 * ==================== PAYMENT SETUP MANAGEMENT (ADMIN) ====================
 */

/**
 * Get Payment Setups
 */
const getPaymentSetups = async (req, res, next) => {
  try {
    // Admin likely views their own payment setups or setups for their company?
    // "Payment Setup" usually refers to Gateway configurations (Razorpay/Stripe) for the platform or for the Admin's tenants?
    // Based on `payment_setups` table `company_id`:
    const adminCompanyId = req.user.company_id;

    const [setups] = await db.query('SELECT * FROM payment_setups WHERE company_id = ?', [adminCompanyId]);
    res.json({ success: true, data: setups });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Payment Setup
 */
const createPaymentSetup = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { provider, config, active } = req.body;

    if (!provider || !config) return res.status(400).json({ success: false, message: 'Provider and Config required.' });

    const configStr = typeof config === 'string' ? config : JSON.stringify(config);

    await db.query(
      'INSERT INTO payment_setups (company_id, provider, config, active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [adminCompanyId, provider, configStr, active ? 1 : 0, req.user.id]
    );

    res.json({ success: true, message: 'Payment Setup created.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Payment Setup
 */
const updatePaymentSetup = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminCompanyId = req.user.company_id;
    const { provider, config, active } = req.body;

    // Verify ownership
    const [check] = await db.query('SELECT id FROM payment_setups WHERE id = ? AND company_id = ?', [id, adminCompanyId]);
    if (check.length === 0) return res.status(404).json({ success: false, message: 'Setup not found.' });

    const updates = [];
    const params = [];
    if (provider) { updates.push('provider = ?'); params.push(provider); }
    if (config) { updates.push('config = ?'); params.push(typeof config === 'string' ? config : JSON.stringify(config)); }
    if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await db.query(`UPDATE payment_setups SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    res.json({ success: true, message: 'Payment Setup updated.' });
  } catch (error) {
    next(error);
  }
};


// --- Payment Gateways (New) ---
const getPaymentGateways = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [gateways] = await db.query('SELECT * FROM payment_gateways WHERE company_id = ? ORDER BY created_at DESC', [adminCompanyId]);
    res.json({ success: true, data: gateways });
  } catch (error) {
    next(error);
  }
};

const createPaymentGateway = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { name, apiKey, webhookUrl, transactionFee, supportedMethods, logo, status } = req.body;
    await db.query(`
      INSERT INTO payment_gateways (company_id, name, api_key, webhook_url, transaction_fee, supported_methods, logo, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [adminCompanyId, name, apiKey, webhookUrl, transactionFee, JSON.stringify(supportedMethods), logo, status || 'Active']);
    res.status(201).json({ success: true, message: 'Gateway added successfully' });
  } catch (error) {
    next(error);
  }
};

const updatePaymentGateway = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const { name, apiKey, webhookUrl, transactionFee, supportedMethods, logo, status } = req.body;
    const [result] = await db.query(`
      UPDATE payment_gateways 
      SET name=?, api_key=?, webhook_url=?, transaction_fee=?, supported_methods=?, logo=?, status=? 
      WHERE id=? AND company_id=?
    `, [name, apiKey, webhookUrl, transactionFee, JSON.stringify(supportedMethods), logo, status, id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Gateway not found or permission denied.' });
    }

    res.json({ success: true, message: 'Gateway updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deletePaymentGateway = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM payment_gateways WHERE id=? AND company_id=?', [id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Gateway not found or permission denied.' });
    }

    res.json({ success: true, message: 'Gateway deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// --- Bank Accounts (New) ---
const getBankAccounts = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [accounts] = await db.query('SELECT * FROM company_bank_accounts WHERE company_id = ? ORDER BY created_at DESC', [adminCompanyId]);
    res.json({ success: true, data: accounts });
  } catch (error) {
    next(error);
  }
};

const createBankAccount = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { bankName, accountHolder, accountNumber, ifscCode, branch, transactionLimit, processingTime, status } = req.body;
    await db.query(`
      INSERT INTO company_bank_accounts (company_id, bank_name, account_holder, account_number, ifsc_code, branch, transaction_limit, processing_time, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [adminCompanyId, bankName, accountHolder, accountNumber, ifscCode, branch, transactionLimit, processingTime, status || 'Pending Verification']);
    res.status(201).json({ success: true, message: 'Bank account added successfully' });
  } catch (error) {
    next(error);
  }
};

const updateBankAccount = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const { bankName, accountHolder, accountNumber, ifscCode, branch, transactionLimit, processingTime, status } = req.body;
    const [result] = await db.query(`
      UPDATE company_bank_accounts 
      SET bank_name=?, account_holder=?, account_number=?, ifsc_code=?, branch=?, transaction_limit=?, processing_time=?, status=? 
      WHERE id=? AND company_id=?
    `, [bankName, accountHolder, accountNumber, ifscCode, branch, transactionLimit, processingTime, status, id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found or permission denied.' });
    }

    res.json({ success: true, message: 'Bank account updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteBankAccount = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM company_bank_accounts WHERE id=? AND company_id=?', [id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Bank account not found or permission denied.' });
    }

    res.json({ success: true, message: 'Bank account deleted successfully' });
  } catch (error) {
    next(error);
  }
};


// --- Job Vacancies (New) ---
const getJobVacancies = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [vacancies] = await db.query('SELECT * FROM job_vacancies WHERE company_id = ? ORDER BY created_at DESC', [adminCompanyId]);
    res.json({ success: true, data: vacancies });
  } catch (error) {
    next(error);
  }
};

const createJobVacancy = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { title, department, location, description, salary, employer, jobType, experience, expiryDate, requirements, status, level } = req.body;
    await db.query(`
      INSERT INTO job_vacancies (company_id, title, department, location, description, salary_min, employer_name, job_type, experience_required, expiry_date, skills, status, level) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [adminCompanyId, title, department, location, description, salary /* using salary as min for now */, employer, jobType, experience, expiryDate, requirements, status || 'Active', level]);
    res.status(201).json({ success: true, message: 'Vacancy created successfully' });
  } catch (error) {
    next(error);
  }
};

const updateJobVacancy = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const { title, department, location, description, salary, employer, jobType, experience, expiryDate, requirements, status, level } = req.body;
    const [result] = await db.query(`
      UPDATE job_vacancies 
      SET title=?, department=?, location=?, description=?, salary_min=?, employer_name=?, job_type=?, experience_required=?, expiry_date=?, skills=?, status=?, level=?
      WHERE id=? AND company_id=?
    `, [title, department, location, description, salary, employer, jobType, experience, expiryDate, requirements, status, level, id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Vacancy not found or permission denied.' });
    }

    res.json({ success: true, message: 'Vacancy updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteJobVacancy = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM job_vacancies WHERE id=? AND company_id=?', [id, adminCompanyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Vacancy not found or permission denied.' });
    }

    res.json({ success: true, message: 'Vacancy deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// --- Job Seekers (New) ---
const getJobSeekers = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    // Job seekers are users with role='jobseeker' + their profile
    // Using subquery for count to safely get profile fields associated with the user
    const [seekers] = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, u.last_login,
             p.skills, p.experience, p.education, p.current_company as currentCompany, p.level,
             (SELECT COUNT(*) FROM job_applications ja JOIN jobs j ON ja.job_id = j.id JOIN employers e ON j.employer_id = e.id WHERE ja.jobseeker_id = u.id AND e.company_id = ?) as applications_count
      FROM users u
      LEFT JOIN job_seeker_profiles p ON u.id = p.user_id
      WHERE u.role = 'jobseeker'
      ORDER BY u.created_at DESC
    `, [adminCompanyId]);
    res.json({ success: true, data: seekers });
  } catch (error) {
    next(error);
  }
};

const createJobSeeker = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'jobseeker123', 10);

    // Create user with role jobseeker
    const [userResult] = await db.query(`
      INSERT INTO users (name, email, password, phone, role, status, created_at, updated_at) 
      VALUES (?, ?, ?, ?, 'jobseeker', 'active', NOW(), NOW())
    `, [name, email, hashedPassword, phone || null]);

    const userId = userResult.insertId;
    const { skills, experience, education, currentCompany, level } = req.body;

    // Create profile
    await db.query(`
      INSERT INTO job_seeker_profiles (user_id, skills, experience, education, current_company, level)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, skills || '', experience || '', education || '', currentCompany || '', level || 'Entry']);

    res.status(201).json({ success: true, message: 'Job seeker added successfully' });
  } catch (error) {
    next(error);
  }
};

const getJobSeekerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get job seeker details
    const [users] = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, u.last_login
      FROM users u
      WHERE u.id = ? AND u.role = 'jobseeker'
    `, [id]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Job seeker not found' });
    }

    const [applications] = await db.query(`
      SELECT ja.*, j.title as job_title, j.location, e.company_name
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN employers e ON j.employer_id = e.id
      WHERE ja.jobseeker_id = ? AND e.company_id = ?
      ORDER BY ja.applied_at DESC
    `, [id, adminCompanyId]);

    res.json({
      success: true,
      data: {
        ...users[0],
        applications
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateJobSeeker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, status } = req.body;

    // Check if job seeker exists
    const [existing] = await db.query('SELECT id FROM users WHERE id = ? AND role = "jobseeker"', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Job seeker not found' });
    }

    // Update user
    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (status) { updates.push('status = ?'); params.push(status); }

    if (updates.length > 0) {
      params.push(id);
      await db.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    }

    res.json({ success: true, message: 'Job seeker updated successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteJobSeeker = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if job seeker exists
    const [existing] = await db.query('SELECT id FROM users WHERE id = ? AND role = "jobseeker"', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Job seeker not found' });
    }

    // Delete user (this will cascade delete applications if FK is set)
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'Job seeker deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getPendingCreditRequests = async (req, res, next) => {
  try {
    const adminCompanyId = req.user.company_id;
    const [requests] = await db.query(`
      SELECT t.*, e.company_name as employer_name, u.name as requested_by_name
      FROM transactions t
      JOIN employers e ON t.employer_id = e.id
      JOIN users u ON t.user_id = u.id
      WHERE e.company_id = ? AND t.type = 'credit' AND t.status = 'pending'
      ORDER BY t.created_at DESC
    `, [adminCompanyId]);

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    next(error);
  }
};

const approveCreditRequest = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id } = req.params;
    const [txnRows] = await connection.query('SELECT * FROM transactions WHERE id = ? AND status = ?', [id, 'pending']);
    if (txnRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
    }
    const txn = txnRows[0];

    // 1. Update Transaction
    await connection.query('UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?', ['success', id]);

    // 2. Update Employer Credits
    const [creditRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [txn.employer_id]);
    const amount = parseFloat(txn.amount);

    if (creditRows.length > 0) {
      await connection.query(
        'UPDATE credits SET balance = balance + ?, total_added = total_added + ?, updated_at = NOW() WHERE employer_id = ?',
        [amount, amount, txn.employer_id]
      );
    } else {
      await connection.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used, created_at, updated_at) VALUES (?, ?, ?, 0, NOW(), NOW())',
        [txn.employer_id, amount, amount]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Credit request approved successfully.' });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

const rejectCreditRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [result] = await db.query(
      'UPDATE transactions SET status = ?, description = CONCAT(description, ?), updated_at = NOW() WHERE id = ? AND status = ?',
      ['failed', reason ? ` (Rejected: ${reason})` : ' (Rejected)', id, 'pending']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
    }

    res.json({ success: true, message: 'Credit request rejected.' });
  } catch (error) {
    next(error);
  }
};

const toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'blocked'

    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use active or blocked.' });
    }

    const [result] = await db.query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, message: `User status updated to ${status}.` });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getDashboardSummary,
  getEmployers,
  // getEmployees, // Removed
  getTransactions,
  deleteTransaction,
  createEmployer,
  getAllEmployers,
  getEmployerById,
  updateEmployer,
  deleteEmployer,
  addCredit,
  createEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  createVendor,
  getAllVendors,
  updateVendor,
  deleteVendor,
  addCreditBulk,
  // Bill Company
  createBillCompany,
  getBillCompanies,
  updateBillCompany,
  deleteBillCompany,
  // Payment Setup
  createPaymentSetup,
  getPaymentSetups,
  updatePaymentSetup,
  purchasePlan,
  getMySubscription,
  getMyPayments,
  getSubscriptionStatus,
  // Job Portal
  getAllJobs, // Legacy
  createJob, // Legacy
  updateJob, // Legacy
  deleteJob, // Legacy
  getJobVacancies, createJobVacancy, updateJobVacancy, deleteJobVacancy,
  getJobSeekers, getJobSeekerById, createJobSeeker, updateJobSeeker, deleteJobSeeker,
  // Attendance & Training
  getAttendance,
  getTrainings,
  assignTraining,
  createTraining,
  markAttendance,
  // New Training Functions
  uploadTrainingMaterial,
  getTrainingMaterials,
  markTrainingCompletion,
  getTrainingResults,
  getTrainingResults,
  deleteTraining,
  getTrainingById,
  updateTraining,
  // Bill Companies - Already exported above as getBillCompanies, etc.
  // We should remove duplicates from the end of the exports list
  // Retaining only unique exports
  getPaymentGateways, createPaymentGateway, updatePaymentGateway, deletePaymentGateway,
  getBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount,
  approveCreditRequest,
  rejectCreditRequest,
  getPendingCreditRequests,
  toggleUserStatus,
};

