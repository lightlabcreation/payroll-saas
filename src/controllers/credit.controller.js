const db = require('../config/mysql');

/**
 * ==================== ADMIN APIs ====================
 */

/**
 * Add credit to single employer
 * POST /admin/credits/add
 */
const addCreditSingle = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employer_id, amount, reference_note, payment_mode, transaction_id } = req.body;
    const admin_id = req.user?.id;

    // Validation
    if (!employer_id || amount === undefined) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'employer_id and amount are required.',
      });
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0.',
      });
    }

    // Verify employer exists
    const [empRows] = await connection.query('SELECT id FROM companies WHERE id = ?', [employer_id]);
    if (empRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Employer not found.',
      });
    }

    // Create credit transaction
    await connection.query(
      `INSERT INTO credit_transactions (employer_id, amount, type, reference_note, payment_mode, transaction_id, created_by, created_at, updated_at, is_deleted)
       VALUES (?, ?, 'CREDIT', ?, ?, ?, ?, NOW(), NOW(), 0)`,
      [employer_id, amountNum, reference_note || null, payment_mode || null, transaction_id || null, admin_id]
    );

    // Update or create wallet (credits table)
    const [walletRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [employer_id]);
    let wallet = walletRows[0];
    let newBalance = 0;

    if (wallet) {
      newBalance = parseFloat(wallet.balance) + amountNum;
      await connection.query('UPDATE credits SET balance = balance + ?, total_added = total_added + ?, updated_at = NOW() WHERE id = ?', [amountNum, amountNum, wallet.id]);
    } else {
      newBalance = amountNum;
      await connection.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used, created_at, updated_at) VALUES (?, ?, ?, 0, NOW(), NOW())',
        [employer_id, amountNum, amountNum]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Credit added successfully.',
      data: {
        employer_id,
        amount: amountNum,
        new_balance: newBalance,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Bulk add credit to multiple companies
 * POST /admin/credits/bulk-add
 */
/**
 * Bulk add credit to multiple companies
 * POST /admin/credits/bulk-add
 */
const addCreditBulk = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employer_ids, amount, reference_note, payment_mode, transaction_id } = req.body;
    const admin_id = req.user?.id;

    // Validation
    if (!employer_ids || !Array.isArray(employer_ids) || employer_ids.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'employer_ids must be a non-empty array.',
      });
    }

    if (amount === undefined) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'amount is required.',
      });
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0.',
      });
    }

    // Verify all companies exist
    const [existingEmps] = await connection.query('SELECT id FROM companies WHERE id IN (?)', [employer_ids]);

    if (existingEmps.length !== employer_ids.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'One or more companies not found.',
      });
    }

    const results = [];

    // Process each employer
    // Since we are in a transaction, if one fails we rollback all as per original logic ("if any employer fails, rollback entire transaction")
    // We can execute queries directly.

    for (const emp_id of employer_ids) {
      // Create transaction
      await connection.query(
        `INSERT INTO credit_transactions (employer_id, amount, type, reference_note, payment_mode, transaction_id, created_by, created_at, updated_at, is_deleted)
           VALUES (?, ?, 'CREDIT', ?, ?, ?, ?, NOW(), NOW(), 0)`,
        [emp_id, amountNum, reference_note || null, payment_mode || null, transaction_id || null, admin_id]
      );

      // Update wallet
      const [walletRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ? FOR UPDATE', [emp_id]);
      let newBalance = 0;

      if (walletRows.length > 0) {
        const wallet = walletRows[0];
        newBalance = parseFloat(wallet.balance) + amountNum;
        await connection.query('UPDATE credits SET balance = balance + ?, total_added = total_added + ?, updated_at = NOW() WHERE id = ?', [amountNum, amountNum, wallet.id]);
      } else {
        newBalance = amountNum;
        await connection.query(
          'INSERT INTO credits (employer_id, balance, total_added, total_used, created_at, updated_at) VALUES (?, ?, ?, 0, NOW(), NOW())',
          [emp_id, amountNum, amountNum]
        );
      }

      results.push({
        employer_id: emp_id,
        success: true,
        new_balance: newBalance,
      });
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: `Credit added successfully to ${results.length} employer(s).`,
      data: results,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get credit statistics
 * GET /admin/credits/stats
 */
/**
 * Get credit statistics
 * GET /admin/credits/stats
 */
const getCreditStats = async (req, res, next) => {
  try {
    const [totalCreditsRows] = await db.query("SELECT SUM(amount) as total FROM credit_transactions WHERE type = 'CREDIT' AND is_deleted = 0");
    const totalCredits = totalCreditsRows[0].total || 0;

    const [totalDebitsRows] = await db.query("SELECT SUM(amount) as total FROM credit_transactions WHERE type = 'DEBIT' AND is_deleted = 0");
    const totalDebits = totalDebitsRows[0].total || 0;

    const [employersCountRows] = await db.query("SELECT COUNT(DISTINCT employer_id) as total FROM credit_transactions WHERE is_deleted = 0");
    const companiesCount = companiesCountRows[0].total || 0;

    const [transactionsCountRows] = await db.query("SELECT COUNT(*) as total FROM credit_transactions WHERE is_deleted = 0");
    const transactionsCount = transactionsCountRows[0].total || 0;

    res.json({
      success: true,
      data: {
        total_credits_added: parseFloat(totalCredits),
        total_debits: parseFloat(totalDebits),
        net_balance: parseFloat(totalCredits) - parseFloat(totalDebits),
        companies_with_transactions: companiesCount,
        total_transactions: transactionsCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get admin credit history with filters
 * GET /admin/credits
 */
/**
 * Get admin credit history with filters
 * GET /admin/credits
 */
const getAdminCreditHistory = async (req, res, next) => {
  try {
    const { employer_id, payment_mode, from_date, to_date, type } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    let query = `
        SELECT ct.*, emp.company_name, u.name as admin_name, u.email as admin_email
        FROM credit_transactions ct
        LEFT JOIN companies emp ON ct.employer_id = emp.id
        LEFT JOIN users u ON ct.created_by = u.id
        WHERE ct.is_deleted = 0
    `;
    const countQuery = `SELECT COUNT(*) as total FROM credit_transactions ct WHERE ct.is_deleted = 0`;
    const params = [];
    let whereClause = '';

    if (employer_id) {
      whereClause += ' AND ct.employer_id = ?';
      params.push(employer_id);
    }
    if (payment_mode) {
      whereClause += ' AND ct.payment_mode = ?';
      params.push(payment_mode);
    }
    if (type) {
      whereClause += ' AND ct.type = ?';
      params.push(type);
    }
    if (from_date) {
      whereClause += ' AND ct.created_at >= ?';
      params.push(new Date(from_date));
    }
    if (to_date) {
      whereClause += ' AND ct.created_at <= ?';
      params.push(new Date(to_date));
    }

    // Combine queries
    query += whereClause + ' ORDER BY ct.created_at DESC LIMIT ? OFFSET ?';
    const countParams = [...params];
    params.push(limit, offset);

    const [rows] = await db.query(query, params);
    const [countResult] = await db.query(countQuery + whereClause, countParams);
    const count = countResult[0].total;

    res.json({
      success: true,
      data: rows.map(txn => ({
        id: txn.id,
        employer_id: txn.employer_id,
        employer_name: txn.company_name || 'N/A',
        amount: parseFloat(txn.amount),
        type: txn.type,
        reference_note: txn.reference_note,
        payment_mode: txn.payment_mode,
        transaction_id: txn.transaction_id,
        created_by: txn.admin_name || 'System',
        created_at: txn.created_at,
      })),
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== EMPLOYER APIs ====================
 */

/**
 * Get employer wallet balance
 * GET /employer/wallet
 */
/**
 * Get employer wallet balance
 * GET /employer/wallet
 */
const getEmployerWallet = async (req, res, next) => {
  try {
    const employer_id = req.employer?.id; // Populated by auth middleware

    if (!employer_id) {
      return res.status(401).json({
        success: false,
        message: 'Employer not found in token.',
      });
    }

    let [rows] = await db.query('SELECT * FROM credits WHERE employer_id = ?', [employer_id]);
    let wallet = rows[0];

    // If wallet doesn't exist, create it with 0 balance
    if (!wallet) {
      await db.query(
        'INSERT INTO credits (employer_id, balance, total_added, total_used, created_at, updated_at) VALUES (?, 0, 0, 0, NOW(), NOW())',
        [employer_id]
      );
      const [newRows] = await db.query('SELECT * FROM credits WHERE employer_id = ?', [employer_id]);
      wallet = newRows[0];
    }

    res.json({
      success: true,
      data: {
        employer_id,
        balance: parseFloat(wallet?.balance || 0),
        currency: 'USD',
        updated_at: wallet?.updated_at || new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get employer credit history
 * GET /employer/credits
 */
const getEmployerCreditHistory = async (req, res, next) => {
  try {
    const employer_id = req.employer?.id;

    if (!employer_id) {
      return res.status(401).json({
        success: false,
        message: 'Employer not found in token.',
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    // We use a UNION to get data from both credit_transactions (ledger) and transactions (requests/salary/etc.)
    const [rows] = await db.query(`
      (
        SELECT 
          ct.id, 
          ct.amount, 
          ct.transaction_type as type, 
          ct.description as reference_note, 
          NULL as payment_mode, 
          ct.transaction_id, 
          ct.created_at,
          'Success' as status,
          u.name as admin_name
        FROM credit_transactions ct
        LEFT JOIN users u ON ct.created_by = u.id
        WHERE ct.employer_id = ? AND ct.is_deleted = 0
      )
      UNION ALL
      (
        SELECT 
          t.id, 
          t.amount, 
          t.type, 
          t.description as reference_note, 
          t.payment_method as payment_mode, 
          t.transaction_id, 
          t.created_at,
          t.status,
          NULL as admin_name
        FROM transactions t
        WHERE t.employer_id = ? AND (
          (t.type = 'credit' AND t.status = 'pending') OR
          (t.type IN ('salary', 'vendor_payment'))
        )
      )
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [employer_id, employer_id, limit, offset]);

    const [countResult] = await db.query(`
      SELECT (
        (SELECT COUNT(*) FROM credit_transactions WHERE employer_id = ? AND is_deleted = 0) +
        (SELECT COUNT(*) FROM transactions WHERE employer_id = ? AND ((type = 'credit' AND status = 'pending') OR (type IN ('salary', 'vendor_payment'))))
      ) as total
    `, [employer_id, employer_id]);

    const count = countResult[0].total;

    res.json({
      success: true,
      data: rows.map(txn => ({
        id: txn.id,
        amount: parseFloat(txn.amount),
        type: txn.type,
        reference_note: txn.reference_note,
        payment_mode: txn.payment_mode,
        transaction_id: txn.transaction_id,
        status: txn.status,
        added_by: txn.admin_name || 'System',
        created_at: txn.created_at,
      })),
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Credit by ID (for Edit) - ADMIN
const getCreditById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [credit] = await db.query('SELECT * FROM credits WHERE id = ?', [id]);
    if (credit.length === 0) {
      return res.status(404).json({ success: false, message: 'Credit record not found' });
    }
    res.json({ success: true, data: credit[0] });
  } catch (error) {
    next(error);
  }
};

// Update Credit Balance - ADMIN
const updateCredit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { balance, total_added } = req.body;

    // Validate
    if (balance === undefined) {
      return res.status(400).json({ success: false, message: 'Balance is required' });
    }

    const [existing] = await db.query('SELECT * FROM credits WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Credit record not found' });
    }

    // Update
    await db.query(
      'UPDATE credits SET balance = ?, total_added = ? WHERE id = ?',
      [balance, total_added || existing[0].total_added, id]
    );

    res.json({ success: true, message: 'Credit updated successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Admin APIs
  addCreditSingle,
  addCreditBulk,
  getCreditStats,
  getAdminCreditHistory,
  getCreditById,
  updateCredit,
  // Employer APIs
  getEmployerWallet,
  getEmployerCreditHistory,
};
