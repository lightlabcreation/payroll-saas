
const db = require('../config/mysql');
const bcrypt = require('bcrypt');

// Import new pure SQL services
const authService = require('../services/auth.service');
const superAdminService = require('../services/superadmin.service');
const emailService = require('../services/email.service');
const activationService = require('../services/activation.service');
const auditService = require('../services/audit.service');

/**
 * Get Super Admin Dashboard Data
 */
const getDashboard = async (req, res, next) => {
  try {
    // Get total counts
    // Get total counts
    const [[{ count: totalCompanies }]] = await db.query('SELECT COUNT(*) as count FROM companies');
    const [[{ count: totalAdmins }]] = await db.query('SELECT COUNT(*) as count FROM admins');
    const [[{ count: totalEmployees }]] = await db.query('SELECT COUNT(*) as count FROM employees');
    const [[{ count: totalVendors }]] = await db.query('SELECT COUNT(*) as count FROM vendors');
    const [[{ count: totalJobs }]] = await db.query('SELECT COUNT(*) as count FROM jobs');
    const [[{ count: totalApplications }]] = await db.query('SELECT COUNT(*) as count FROM job_applications');
    const [[{ count: activeUsers }]] = await db.query('SELECT COUNT(*) as count FROM users WHERE status = "active"');
    const [[{ count: blockedUsers }]] = await db.query('SELECT COUNT(*) as count FROM users WHERE status = "blocked"');

    // Get recent activities
    const [recentUsers] = await db.query(
      'SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 10'
    );

    // Get analytics summary
    const [[{ count: activePlans }]] = await db.query('SELECT COUNT(*) as count FROM subscriptions WHERE status = "active" AND end_date >= NOW()');
    const [[{ count: expiredPlans }]] = await db.query('SELECT COUNT(*) as count FROM subscriptions WHERE status = "expired" OR (status = "active" AND end_date < NOW())');
    const [[{ revenue: monthlyRevenue }]] = await db.query('SELECT SUM(amount) as revenue FROM payments WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)');

    res.json({
      success: true,
      data: {
        summary: {
          totalCompanies,
          totalAdmins,
          totalEmployees,
          totalVendors,
          totalJobs,
          totalApplications,
          activeUsers,
          blockedUsers,
          activePlans: activePlans || 0,
          expiredPlans: expiredPlans || 0,
          monthlyRevenue: monthlyRevenue || 0
        },
        recentUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Admin (Pure SQL - ADMIN ROLE ONLY)
 *
 * CRITICAL RULE: Super Admin can ONLY create ADMIN role
 * NO Employee, Employer, Vendor, or Jobseeker creation allowed
 */
const createAdmin = async (req, res, next) => {
  try {
    const { name, email, password, phone, company_name, companyName, status } = req.body;
    const compName = company_name || companyName || '';
    const adminStatus = status || 'active';

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.',
      });
    }

    // Create Admin User
    const adminUser = await authService.createUser({
      name: name.trim(),
      email: email.trim(),
      password: password,
      phone: phone || null,
      role: 'admin',
      status: adminStatus
    });

    // Create admin record in admins table
    const [adminRecord] = await db.query(
      `INSERT INTO admins (user_id, created_by, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [adminUser.id, req.user?.id || 1]
    );

    const adminRecordId = adminRecord.insertId;

    // Create company record if company_name provided
    let companyId = null;
    if (compName) {
      const [compResult] = await db.query(
        `INSERT INTO companies
         (user_id, admin_id, company_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [adminUser.id, adminRecordId, compName, adminStatus]
      );
      companyId = compResult.insertId;

      await db.query(`UPDATE users SET company_id = ? WHERE id = ?`, [companyId, adminUser.id]);
    }

    res.status(201).json({
      success: true,
      message: 'HR Admin account created successfully.',
      data: {
        id: adminUser.id,
        admin_record_id: adminRecordId,
        company_id: companyId,
        company_name: compName || 'N/A',
        name: adminUser.name,
        email: adminUser.email,
        phone: adminUser.phone,
        role: adminUser.role,
        status: adminUser.status
      },
    });
  } catch (error) {
    if (error.message.includes('already registered') || error.message.includes('Duplicate entry')) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists.',
      });
    }
    next(error);
  }
};

/**
 * Get All Admins (Pure SQL - Company Admins & Employers)
 */
const getAllAdmins = async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query;

    const result = await superAdminService.getAllAdmins({
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      message: 'Admins retrieved successfully',
      count: result.admins.length,
      data: result.admins,
      stats: result.stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Admin
 */
const updateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company_name, companyName, status } = req.body;
    const compName = company_name || companyName;

    // Find user (by user id or admin id)
    let [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    let user = userRows[0];

    if (!user) {
      // Check if id is an admin_record_id
      const [adminRows] = await db.query('SELECT * FROM admins WHERE id = ?', [id]);
      if (adminRows[0]) {
        [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [adminRows[0].user_id]);
        user = userRows[0];
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found.',
      });
    }

    // Update user record
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name.trim()); }
    if (email) { updates.push('email = ?'); params.push(email.trim()); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (status) { updates.push('status = ?'); params.push(status); }

    if (updates.length > 0) {
      params.push(user.id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // Update company name if provided
    if (compName) {
      const [companyRows] = await db.query('SELECT id FROM companies WHERE user_id = ? OR admin_id IN (SELECT id FROM admins WHERE user_id = ?)', [user.id, user.id]);
      if (companyRows.length > 0) {
        await db.query('UPDATE companies SET company_name = ? WHERE id = ?', [compName, companyRows[0].id]);
      } else {
        const [aRows] = await db.query('SELECT id FROM admins WHERE user_id = ?', [user.id]);
        const adminRecId = aRows[0]?.id || null;
        await db.query('INSERT INTO companies (user_id, admin_id, company_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())', [user.id, adminRecId, compName, status || 'active']);
      }
    }

    res.json({
      success: true,
      message: 'Admin updated successfully.',
      data: {
        id: user.id,
        name: name || user.name,
        email: email || user.email,
        phone: phone !== undefined ? phone : user.phone,
        status: status || user.status,
        company_name: compName || 'N/A'
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Admin Details (Pure SQL)
 */
const getAdminDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const admin = await superAdminService.getAdminDetails(parseInt(id));

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found.',
      });
    }

    res.json({
      success: true,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset Admin Password (Pure SQL - Enterprise SaaS)
 * Super Admin can reset any admin's password
 * The new password is immediately effective for login
 */
const resetAdminPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password) {
      return res.status(400).json({
        success: false,
        message: 'New password is required.',
      });
    }

    // Password validation (minimum 6 characters)
    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    const result = await superAdminService.resetAdminPassword(
      parseInt(id),
      new_password,
      req.user.id
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found or password reset failed.',
      });
    }

    res.json({
      success: true,
      message: 'Admin password reset successfully. Admin can now login with the new password.',
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('not an admin')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Reset Admin Password - Alternative Endpoint (Exact Specification)
 *
 * API: POST /api/superadmin/reset-admin-password
 * Body: { "adminId": 12, "newPassword": "Admin@123" }
 *
 * STRICT VALIDATION:
 * - Only SUPER ADMIN can call this
 * - Only ADMIN role passwords can be reset
 * - Password is hashed with bcrypt
 * - SQL UPDATE executes immediately
 * - Old password becomes invalid instantly
 */
const resetAdminPasswordAlt = async (req, res, next) => {
  try {
    const { adminId, newPassword } = req.body;

    // Validation
    if (!adminId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'adminId and newPassword are required.',
      });
    }

    // Password validation (minimum 6 characters)
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // Verify requester is SUPER ADMIN (already enforced by route middleware)
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'FORBIDDEN: Only SUPER ADMIN can reset admin passwords.',
        yourRole: req.user.role
      });
    }

    // Reset password using service
    const result = await superAdminService.resetAdminPassword(
      parseInt(adminId),
      newPassword,
      req.user.id
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found or password reset failed.',
      });
    }

    // Log the action
    console.log(`[PASSWORD RESET] Super Admin ${req.user.id} reset password for Admin ${adminId}`);

    res.json({
      success: true,
      message: 'Password reset successfully. Admin can now login with the new password.',
      data: {
        adminId: parseInt(adminId),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('not an admin')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    console.error('[PASSWORD RESET ERROR]:', error.message);
    next(error);
  }
};

/**
 * Update Admin Status (Block/Unblock)
 */
const updateAdminStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['active', 'inactive', 'suspended', 'blocked'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    const [result] = await db.query('UPDATE users SET status = ? WHERE id = ? OR id IN (SELECT user_id FROM admins WHERE id = ?)', [status, id, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found.',
      });
    }

    res.json({
      success: true,
      message: `Admin status updated to ${status} successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Admin
 */
/**
 * Delete Admin
 */
const deleteAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check by admins.id OR admins.user_id OR directly in users table
    let [adminRows] = await db.query('SELECT * FROM admins WHERE id = ? OR user_id = ?', [id, id]);
    let admin = adminRows[0];

    let userIdToDelete = null;
    let adminName = '';
    let adminEmail = '';

    if (admin) {
      userIdToDelete = admin.user_id;
      const [userRows] = await db.query('SELECT name, email FROM users WHERE id = ?', [userIdToDelete]);
      if (userRows[0]) {
        adminName = userRows[0].name;
        adminEmail = userRows[0].email;
      }
    } else {
      // Check if user exists in users table with role admin or employer
      const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      if (userRows[0]) {
        userIdToDelete = userRows[0].id;
        adminName = userRows[0].name;
        adminEmail = userRows[0].email;
      }
    }

    if (!userIdToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found.',
      });
    }

    // Delete associated admin records and user record
    await db.query('DELETE FROM admins WHERE user_id = ? OR id = ?', [userIdToDelete, id]);
    await db.query('DELETE FROM users WHERE id = ?', [userIdToDelete]);

    // Log the deletion to Audit Logs
    await auditService.log({
      userId: req.user?.id || 1,
      action: 'DELETE_ADMIN',
      details: `Deleted Admin: ${adminName || 'Admin'} (${adminEmail || 'N/A'}) [User ID: #${userIdToDelete}]`,
      ipAddress: req.ip || req.connection?.remoteAddress
    });

    res.json({
      success: true,
      message: 'Admin deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Block/Unblock User
 */
const toggleUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "blocked".',
      });
    }

    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    await db.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);

    res.json({
      success: true,
      message: `User ${status === 'active' ? 'unblocked' : 'blocked'} successfully.`,
      data: {
        id: user.id,
        email: user.email,
        status: status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get System Analytics
 */
/**
 * Get System Analytics
 */
const getAnalytics = async (req, res, next) => {
  try {
    // User growth over last 6 months
    // Pure SQL equivalent
    const query = `
        SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as month, 
            COUNT(id) as count 
        FROM users 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY month 
        ORDER BY month ASC
    `;

    const [userGrowth] = await db.query(query);

    res.json({
      success: true,
      data: {
        userGrowth,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== PLAN MANAGEMENT (PURE SQL) ====================
 */

/**
 * Create Plan
 */
const createPlan = async (req, res, next) => {
  try {
    const { name, description, price, duration_months, duration, max_employees, max_jobs, maxEmployees, maxJobs, features } = req.body;

    const dMonths = parseInt(duration_months || duration);
    const pPrice = parseFloat(price);

    if (!name || isNaN(pPrice) || (isNaN(dMonths) && dMonths !== 0)) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and duration_months (number) are required.',
      });
    }

    // Check if plan name already exists
    const [existing] = await db.query('SELECT id FROM plans WHERE name = ?', [name]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Plan with this name already exists.',
      });
    }

    const featuresJson = JSON.stringify(features || []);

    const [result] = await db.query(
      `INSERT INTO plans (name, description, price, duration_months, max_employees, max_jobs, features, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [name, description, price, dMonths, max_employees || maxEmployees || null, max_jobs || maxJobs || null, featuresJson]
    );

    res.status(201).json({
      success: true,
      message: 'Plan created successfully.',
      data: {
        id: result.insertId,
        name, description, price, duration_months: dMonths
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Plans
 */
const getAllPlans = async (req, res, next) => {
  try {
    const { is_active } = req.query;
    let query = 'SELECT * FROM plans';
    const params = [];

    if (is_active !== undefined) {
      query += ' WHERE is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    query += ' ORDER BY created_at DESC';

    const [plans] = await db.query(query, params);

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Plan by ID
 */
const getPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM plans WHERE id = ?', [id]);
    const plan = rows[0];

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found.',
      });
    }

    res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Plan
 */
const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM plans WHERE id = ?', [id]);
    const plan = rows[0];

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found.',
      });
    }

    // Check if name is being updated and already exists
    if (req.body.name && req.body.name !== plan.name) {
      const [existing] = await db.query('SELECT id FROM plans WHERE name = ?', [req.body.name]);
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Plan with this name already exists.',
        });
      }
    }

    // Dynamic Updates
    const updates = [];
    const params = [];
    const fields = ['name', 'description', 'price', 'duration_months', 'max_employees', 'max_jobs', 'features', 'is_active'];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === 'features' && typeof req.body[field] === 'object') {
          params.push(JSON.stringify(req.body[field]));
        } else {
          params.push(req.body[field]);
        }
      }
    });

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await db.query(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const [updatedRows] = await db.query('SELECT * FROM plans WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Plan updated successfully.',
      data: updatedRows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Plan
 */
const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM plans WHERE id = ?', [id]);
    const plan = rows[0];

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found.',
      });
    }

    // Check if active subscriptions exist
    const [subCount] = await db.query(
      "SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ? AND status = 'active'",
      [id]
    );

    if (subCount[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete plan with active subscriptions. Deactivate it instead.',
      });
    }

    await db.query('DELETE FROM plans WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Plan deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== COMPANY MANAGEMENT ====================
 */

/**
 * Create Company with Admin (Pure SQL - Enterprise SaaS Flow)
 * Super Admin creates a company and assigns/creates an admin to manage it
 *
 * Role Hierarchy: Super Admin → Admin (Company Admin) → Company
 */
const createCompany = async (req, res, next) => {
  try {
    const {
      // Admin details
      admin_name,
      admin_email,
      admin_password,
      admin_phone,
      // Company details
      company_name,
      company_address,
      gst_number,
      pan_number,
      subscription_plan
    } = req.body;

    // Validation
    if (!admin_name || !admin_email || !admin_password || !company_name) {
      return res.status(400).json({
        success: false,
        message: 'Admin name, email, password, and company name are required.',
      });
    }

    // Create company with admin using pure SQL service
    const result = await superAdminService.createCompanyWithAdmin(
      {
        company_name,
        company_address,
        gst_number,
        pan_number,
        subscription_plan
      },
      {
        name: admin_name,
        email: admin_email,
        password: admin_password,
        phone: admin_phone
      },
      req.user.id // Super Admin ID
    );

    // Dispatch Email Notifications asynchronously
    try {
      const activationData = await activationService.generatePasswordSetupToken(
        result.admin.userId || result.user?.id || result.admin.id,
        admin_email
      );

      // 1. Welcome & Activation Link to HR Admin
      emailService.sendHRAdminWelcomeActivationEmail({
        email: admin_email,
        name: admin_name,
        companyName: company_name,
        activationUrl: activationData.activationUrl
      }).catch(err => console.error('[Email Dispatch Error]:', err.message));

      // 2. Super Admin New Registration Alert to info@kiaantechnology.com
      emailService.sendSuperAdminNewRegistrationNotification({
        companyName: company_name,
        adminName: admin_name,
        email: admin_email,
        phone: admin_phone,
        planName: subscription_plan || 'Default'
      }).catch(err => console.error('[Email Dispatch Error]:', err.message));
    } catch (emailErr) {
      console.error('[Activation Token Error]:', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Company and admin created successfully. Welcome and activation email sent.',
      data: {
        company: result.company,
        admin: {
          id: result.admin.id,
          name: result.admin.name,
          email: result.admin.email,
          role: result.admin.role
        }
      },
    });

  } catch (error) {
    if (error.message.includes('already registered')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Get All Companies (Employers)
 */
/**
 * Get All Companies (Employers)
 */
const getAllCompanies = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    let query = `
        SELECT e.*, 
               COALESCE(u.email, u2.email) as user_email, 
               COALESCE(u.name, u2.name) as user_name, 
               COALESCE(u.status, u2.status) as user_status, 
               COALESCE(u.last_login, u2.last_login) as last_login, 
               COALESCE(u.created_at, u2.created_at) as user_created_at,
               s.plan_id as sub_plan_id, s.status as sub_status, s.start_date as sub_start, s.end_date as sub_end,
               p.name as plan_name, p.price as plan_price
        FROM companies e
        LEFT JOIN users u ON e.user_id = u.id
        LEFT JOIN admins a ON e.admin_id = a.id
        LEFT JOIN users u2 ON a.user_id = u2.id
        LEFT JOIN (
            SELECT * FROM subscriptions WHERE id IN (
                SELECT MAX(id) FROM subscriptions GROUP BY employer_id
            )
        ) s ON e.id = s.employer_id
        LEFT JOIN plans p ON s.plan_id = p.id
        WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (e.company_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY e.created_at DESC';

    const [rows] = await db.query(query, params);

    const companies = rows.map(row => ({
      id: row.id,
      company_name: row.company_name,
      company_logo: row.company_logo,
      company_address: row.company_address,
      gst_number: row.gst_number,
      pan_number: row.pan_number,
      subscription_plan: row.subscription_plan,
      status: row.status,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        status: row.user_status,
        last_login: row.last_login,
        created_at: row.user_created_at
      },
      current_subscription: row.sub_plan_id ? {
        plan_id: row.sub_plan_id,
        status: row.sub_status,
        start_date: row.sub_start,
        end_date: row.sub_end,
        plan: {
          id: row.sub_plan_id,
          name: row.plan_name,
          price: row.plan_price
        }
      } : null,
      created_at: row.created_at,
    }));

    res.json({
      success: true,
      data: companies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign Plan to Company
 */
/**
 * Assign Plan to Company
 */
const assignPlanToCompany = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id: employerId } = req.params;
    const { plan_id, start_date, auto_renew } = req.body;

    if (!plan_id) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required.',
      });
    }

    const [empRows] = await connection.query('SELECT * FROM companies WHERE id = ?', [employerId]);
    const employer = empRows[0];
    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    const [planRows] = await connection.query('SELECT * FROM plans WHERE id = ?', [plan_id]);
    const plan = planRows[0];
    if (!plan) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Plan not found.' });
    }

    // Deactivate existing active subscriptions
    await connection.query(
      "UPDATE subscriptions SET status = 'expired' WHERE employer_id = ? AND status = 'active'",
      [employerId]
    );

    // Calculate end date
    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + plan.duration_months);

    // Create new subscription
    const [subResult] = await connection.query(
      `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
      [employerId, plan_id, startDate, endDate, auto_renew !== undefined ? auto_renew : true]
    );

    // Update employer subscription_plan field
    await connection.query('UPDATE companies SET subscription_plan = ? WHERE id = ?', [plan.name, employerId]);

    await connection.commit();

    // Fetch created subscription (not strictly necessary but good for response)
    const [newSub] = await connection.query('SELECT * FROM subscriptions WHERE id = ?', [subResult.insertId]);

    res.status(201).json({
      success: true,
      message: 'Plan assigned to company successfully.',
      data: {
        subscription: newSub[0],
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price,
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

/**
 * Update Company
 */
const updateCompany = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id: employerId } = req.params;
    const { company_name, company_address, gst_number, pan_number, company_logo, name, email } = req.body;

    const [empRows] = await connection.query('SELECT * FROM companies WHERE id = ?', [employerId]);
    const employer = empRows[0];
    if (!employer) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ?', [employer.user_id]);
    const user = userRows[0];

    // Update employer fields
    const empUpdates = [];
    const empParams = [];
    if (company_name) { empUpdates.push('company_name = ?'); empParams.push(company_name); }
    if (company_address !== undefined) { empUpdates.push('company_address = ?'); empParams.push(company_address); }
    if (gst_number !== undefined) { empUpdates.push('gst_number = ?'); empParams.push(gst_number); }
    if (pan_number !== undefined) { empUpdates.push('pan_number = ?'); empParams.push(pan_number); }
    if (company_logo !== undefined) { empUpdates.push('company_logo = ?'); empParams.push(company_logo); }

    if (empUpdates.length > 0) {
      empParams.push(employerId);
      await connection.query(`UPDATE companies SET ${empUpdates.join(', ')} WHERE id = ?`, empParams);
    }

    // Update user fields
    const userUpdates = [];
    const userParams = [];
    if (name) { userUpdates.push('name = ?'); userParams.push(name); }

    if (email && email !== user.email) {
      const formattedEmail = email.toLowerCase().trim();
      const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [formattedEmail]);
      if (existingUser.length > 0 && existingUser[0].id !== user.id) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Email already in use.' });
      }
      userUpdates.push('email = ?'); userParams.push(formattedEmail);
    }

    if (userUpdates.length > 0) {
      userParams.push(user.id);
      await connection.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, userParams);
    }

    await connection.commit();

    // Fetch updated data using helpers or constructing manually
    // Just returning input data combined with existing ID for simplicity as standard practice here
    res.json({
      success: true,
      message: 'Company updated successfully.',
      data: {
        id: employer.id,
        company_name: company_name || employer.company_name,
        user: {
          id: user.id,
          name: name || user.name,
          email: email || user.email,
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

/**
 * Delete Company
 */
const deleteCompany = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;

    // Disable FK checks to handle potential orphaned data/circular refs
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.beginTransaction();

    // Get company details to find user and admin (optional, for cleanup)
    const [empRows] = await connection.query('SELECT user_id, admin_id FROM companies WHERE id = ?', [id]);

    // 1. Delete Subscriptions (Always)
    await connection.query('DELETE FROM subscriptions WHERE employer_id = ?', [id]);

    // 2. Delete Company (Employer)
    await connection.query('DELETE FROM companies WHERE id = ?', [id]);

    // 3. Delete Extra Records if found
    if (empRows.length > 0) {
      const { user_id, admin_id } = empRows[0];
      if (admin_id) await connection.query('DELETE FROM admins WHERE id = ?', [admin_id]);
      if (user_id) await connection.query('DELETE FROM users WHERE id = ?', [user_id]);
    }

    await connection.commit();
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    res.json({
      success: true,
      message: 'Company deleted successfully.',
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Activate/Deactivate Company
 */
const toggleCompanyStatus = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id: employerId } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const [empRows] = await connection.query('SELECT * FROM companies WHERE id = ?', [employerId]);
    if (empRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    const employer = empRows[0];

    await connection.query('UPDATE companies SET status = ? WHERE id = ?', [status, employerId]);

    // Update user status
    let userStatus = 'active';
    if (status === 'inactive' || status === 'suspended') {
      userStatus = 'blocked';
    }

    // Only update user status if it needs to change to sync with company
    // (e.g. if company active -> user active. if company suspended -> user blocked)
    // We update blindly to sync state
    await connection.query('UPDATE users SET status = ? WHERE id = ?', [userStatus, employer.user_id]);

    await connection.commit();

    res.json({
      success: true,
      message: `Company ${status === 'active' ? 'activated' : 'deactivated'} successfully.`,
      data: {
        id: employer.id,
        company_name: employer.company_name,
        status: status,
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
 * ==================== INVOICE & PAYMENT MANAGEMENT ====================
 */

/**
 * Generate Invoice
 */
const generateInvoice = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { employer_id, plan_id, subscription_id, amount, tax_amount, due_date, notes } = req.body;

    if (!employer_id || !plan_id || !amount || !due_date) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Employer ID, Plan ID, amount, and due date are required.' });
    }

    // Validate Employer
    const [empRows] = await connection.query('SELECT id FROM companies WHERE id = ?', [employer_id]);
    if (empRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    // Validate Plan
    const [planRows] = await connection.query('SELECT id FROM plans WHERE id = ?', [plan_id]);
    if (planRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Plan not found.' });
    }

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${employer_id}`;
    const tax = tax_amount || 0;
    const totalAmount = parseFloat(amount) + parseFloat(tax);

    const [result] = await connection.query(
      `INSERT INTO invoices (invoice_number, employer_id, subscription_id, plan_id, amount, tax_amount, total_amount, due_date, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [invoiceNumber, employer_id, subscription_id || null, plan_id, amount, tax, totalAmount, new Date(due_date), notes]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Invoice generated successfully.',
      data: { id: result.insertId, invoice_number: invoiceNumber },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Record Payment
 */
const recordPayment = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { invoice_id, amount, payment_method, payment_reference, transaction_id, notes } = req.body;

    if (!invoice_id || !amount || !payment_method) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invoice ID, amount, and payment method are required.' });
    }

    const [invRows] = await connection.query('SELECT * FROM invoices WHERE id = ?', [invoice_id]);
    if (invRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }
    const invoice = invRows[0];

    // Create payment record
    const [payResult] = await connection.query(
      `INSERT INTO payments (invoice_id, employer_id, amount, payment_method, payment_reference, transaction_id, status, notes, created_at, updated_at, payment_date)
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?, NOW(), NOW(), NOW())`,
      [invoice_id, invoice.employer_id, amount, payment_method, payment_reference, transaction_id, notes]
    );

    // Update invoice status
    await connection.query("UPDATE invoices SET status = 'paid', paid_date = NOW() WHERE id = ?", [invoice_id]);

    // Update employer credit
    const [creditRows] = await connection.query('SELECT * FROM credits WHERE employer_id = ?', [invoice.employer_id]);
    if (creditRows.length === 0) {
      await connection.query(
        `INSERT INTO credits (employer_id, balance, total_added, total_used, created_at, updated_at)
         VALUES (?, ?, ?, 0, NOW(), NOW())`,
        [invoice.employer_id, amount, amount]
      );
    } else {
      await connection.query(
        'UPDATE credits SET balance = balance + ?, total_added = total_added + ? WHERE employer_id = ?',
        [amount, amount, invoice.employer_id]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully.',
      data: { id: payResult.insertId },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get Payment & Invoice History
 */
const getPaymentInvoiceHistory = async (req, res, next) => {
  try {
    const { employer_id } = req.query;
    let query = `
        SELECT i.*, 
            e.company_name, 
            p.name as plan_name, p.price as plan_price,
            pay.id as pay_id, pay.amount as pay_amount, pay.payment_method as pay_method, pay.status as pay_status, pay.payment_date
        FROM invoices i
        LEFT JOIN companies e ON i.employer_id = e.id
        LEFT JOIN plans p ON i.plan_id = p.id
        LEFT JOIN payments pay ON i.id = pay.invoice_id
        WHERE 1=1
    `;
    const params = [];
    if (employer_id) {
      query += ' AND i.employer_id = ?';
      params.push(employer_id);
    }
    query += ' ORDER BY i.created_at DESC';

    const [rows] = await db.query(query, params);

    // Transform flat rows to nested structure if needed (grouping payments under invoices)
    // Since SQL JOIN multiplies rows for each payment, we reduce.
    const invoicesMap = new Map();
    rows.forEach(row => {
      if (!invoicesMap.has(row.id)) {
        invoicesMap.set(row.id, {
          id: row.id,
          invoice_number: row.invoice_number,
          amount: row.amount,
          status: row.status,
          due_date: row.due_date,
          created_at: row.created_at,
          employer: { company_name: row.company_name },
          plan: { name: row.plan_name, price: row.plan_price },
          payments: []
        });
      }
      if (row.pay_id) {
        invoicesMap.get(row.id).payments.push({
          id: row.pay_id,
          amount: row.pay_amount,
          payment_method: row.pay_method,
          status: row.pay_status,
          payment_date: row.payment_date
        });
      }
    });

    res.json({
      success: true,
      data: Array.from(invoicesMap.values()),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Super Admin Profile
 */
const getProfile = async (req, res, next) => {
  try {
    const [userRows] = await db.query('SELECT id, name, email, phone, role, status FROM users WHERE id = ?', [req.user.id]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const nameParts = (user.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    res.json({
      success: true,
      data: {
        id: user.id,
        firstName,
        lastName,
        email: user.email,
        phone: user.phone, // Include phone
        role: user.role,
        status: user.status
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Super Admin Profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone } = req.body;

    // Construct name if separated
    let name = req.body.name;
    if (firstName || lastName) {
      name = `${firstName || ''} ${lastName || ''}`.trim();
    }

    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }

    if (email && email !== user.email) {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) return res.status(409).json({ success: false, message: 'Email already in use.' });
      updates.push('email = ?'); params.push(email);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(user.id);
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        id: user.id,
        name: name || user.name,
        email: email || user.email,
        phone: phone || user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ==================== COMPANY REQUEST MANAGEMENT ====================
 */

/**
 * Get All Company Requests
 */
const getAllCompanyRequests = async (req, res, next) => {
  try {
    const { request_status, payment_status, search } = req.query;

    let query = `
      SELECT 
        cr.*,
        p.id as p_id, p.name as p_name, p.price as p_price, p.duration_months as p_duration,
        u.id as u_id, u.name as u_name, u.email as u_email,
        e.id as e_id, e.company_name as e_company_name
      FROM company_requests cr
      LEFT JOIN plans p ON cr.plan_id = p.id
      LEFT JOIN users u ON cr.processed_by = u.id
      LEFT JOIN companies e ON cr.created_company_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (request_status) {
      query += ' AND cr.request_status = ?';
      params.push(request_status);
    }
    if (payment_status) {
      query += ' AND cr.payment_status = ?';
      params.push(payment_status);
    }
    if (search) {
      const s = `%${search}%`;
      query += ' AND (cr.company_name LIKE ? OR cr.email LIKE ? OR cr.contact_name LIKE ?)';
      params.push(s, s, s);
    }

    query += ' ORDER BY cr.created_at DESC';

    const [rows] = await db.query(query, params);

    const requests = rows.map(row => ({
      id: row.id,
      company_name: row.company_name,
      contact_name: row.contact_name,
      email: row.email,
      phone: row.phone,
      plan_id: row.plan_id,
      payment_status: row.payment_status,
      request_status: row.request_status,
      company_address: row.company_address,
      gst_number: row.gst_number,
      pan_number: row.pan_number,
      notes: row.notes,
      processed_by: row.processed_by,
      processed_at: row.processed_at,
      created_company_id: row.created_company_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      plan: row.p_id ? { id: row.p_id, name: row.p_name, price: row.p_price, duration_months: row.p_duration } : null,
      processedBy: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email } : null,
      createdCompany: row.e_id ? { id: row.e_id, company_name: row.e_company_name } : null
    }));

    res.json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Get Company Request by ID
 */
const getCompanyRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        cr.*,
        p.id as p_id, p.name as p_name, p.price as p_price, p.duration_months as p_duration,
        u.id as u_id, u.name as u_name, u.email as u_email,
        e.id as e_id, e.company_name as e_company_name,
        eu.id as eu_id, eu.name as eu_name, eu.email as eu_email
      FROM company_requests cr
      LEFT JOIN plans p ON cr.plan_id = p.id
      LEFT JOIN users u ON cr.processed_by = u.id
      LEFT JOIN companies e ON cr.created_company_id = e.id
      LEFT JOIN users eu ON e.user_id = eu.id
      WHERE cr.id = ?
    `;

    const [rows] = await db.query(query, [id]);
    const row = rows[0];

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Company request not found.',
      });
    }

    // Format nested structure
    const request = {
      id: row.id,
      company_name: row.company_name,
      contact_name: row.contact_name,
      email: row.email,
      phone: row.phone,
      plan_id: row.plan_id,
      payment_status: row.payment_status,
      request_status: row.request_status,
      company_address: row.company_address,
      gst_number: row.gst_number,
      pan_number: row.pan_number,
      notes: row.notes,
      created_at: row.created_at,
      plan: row.p_id ? { id: row.p_id, name: row.p_name, price: row.p_price, duration_months: row.p_duration } : null,
      processedBy: row.u_id ? { id: row.u_id, name: row.u_name, email: row.u_email } : null,
      createdCompany: row.e_id ? {
        id: row.e_id,
        company_name: row.e_company_name,
        user: row.eu_id ? { id: row.eu_id, name: row.eu_name, email: row.eu_email } : null
      } : null
    };

    res.json({
      success: true,
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Accept Company Request
 * Creates company and company admin user
 */
const acceptCompanyRequest = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id } = req.params;
    const { password } = req.body;

    // 1. Fetch Request with Plan details
    const [reqRows] = await connection.query(`
      SELECT cr.*, p.name as plan_name, p.duration_months, p.price as plan_price 
      FROM company_requests cr 
      LEFT JOIN plans p ON cr.plan_id = p.id 
      WHERE cr.id = ?
    `, [id]);

    const companyRequest = reqRows[0];

    if (!companyRequest) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Company request not found.' });
    }

    if (companyRequest.request_status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Request has already been ${companyRequest.request_status}.` });
    }

    // 2. Check for existing email in Users
    const [existingUsers] = await connection.query('SELECT id FROM users WHERE email = ?', [companyRequest.email]);
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
    }

    // 3. Prepare Password
    const defaultPassword = password || `${companyRequest.company_name.replace(/\s+/g, '')}@123`;
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // 4. Create User (Admin Role) - As per requirement: Company Creator gets 'admin' role
    const [userResult] = await connection.query(
      `INSERT INTO users (name, email, password, phone, role, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 'admin', 'active', NOW(), NOW())`,
      [companyRequest.contact_name, companyRequest.email, hashedPassword, companyRequest.phone]
    );
    const userId = userResult.insertId;

    // 5. Create Admin Record (Since role is 'admin')
    const [adminResult] = await connection.query(
      `INSERT INTO admins (user_id, created_by, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [userId, req.user.id]
    );
    const adminId = adminResult.insertId;

    // 6. Create Employer (Company) - Linked to User and Admin
    const [empResult] = await connection.query(
      `INSERT INTO companies (user_id, admin_id, company_name, company_address, gst_number, pan_number, subscription_plan, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        userId,
        adminId, // Changed: Linking to admin record
        companyRequest.company_name,
        companyRequest.company_address,
        companyRequest.gst_number,
        companyRequest.pan_number,
        companyRequest.plan_name || 'basic'
      ]
    );
    const employerId = empResult.insertId;

    // 7. Link User to Company
    await connection.query('UPDATE users SET company_id = ? WHERE id = ?', [employerId, userId]);

    // 8. Create Subscription (if plan exists)
    if (companyRequest.plan_id) {
      const startDate = new Date();
      const duration = companyRequest.duration_months || 1; // Default 1 month
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + duration);

      const subStatus = companyRequest.payment_status === 'paid' ? 'active' : 'pending';

      // 8.1 If new sub is active, deactivate existing ones first
      if (subStatus === 'active') {
        await connection.query(
          "UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE employer_id = ? AND status = 'active'",
          [employerId]
        );
      }

      const [subResult] = await connection.query(
        `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [employerId, companyRequest.plan_id, startDate, endDate, subStatus]
      );
      const subscriptionId = subResult.insertId;

      // 8a. Generate Invoice if subscription created
      const invoiceNumber = `INV-${Date.now()}-${employerId}`;
      const amount = companyRequest.plan_price || 0;
      await connection.query(
        `INSERT INTO invoices (invoice_number, employer_id, subscription_id, plan_id, amount, tax_amount, total_amount, due_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NOW(), NOW())`,
        [invoiceNumber, employerId, subscriptionId, companyRequest.plan_id, amount, amount, new Date(), subStatus === 'active' ? 'paid' : 'pending']
      );

      // 8b. Record payment if active
      if (subStatus === 'active') {
        const [invRows] = await connection.query('SELECT id FROM invoices WHERE subscription_id = ?', [subscriptionId]);
        const invId = invRows[0]?.id;
        if (invId) {
          await connection.query(
            `INSERT INTO payments (invoice_id, employer_id, amount, payment_method, status, created_at, updated_at, payment_date)
             VALUES (?, ?, ?, 'Manual', 'success', NOW(), NOW(), NOW())`,
            [invId, employerId, amount]
          );
        }
        // Update company name/plan display
        await connection.query('UPDATE companies SET subscription_plan = ? WHERE id = ?', [companyRequest.plan_name, employerId]);
      }
    }

    // 9. Update Company Request Status
    await connection.query(
      `UPDATE company_requests 
       SET request_status = 'accepted', processed_by = ?, processed_at = NOW(), created_company_id = ? 
       WHERE id = ?`,
      [req.user.id, employerId, id]
    );

    await connection.commit();

    // 10. Dispatch Email Notifications asynchronously
    try {
      const activationData = await activationService.generatePasswordSetupToken(userId, companyRequest.email);

      // HR Admin Welcome Activation Email
      emailService.sendHRAdminWelcomeActivationEmail({
        email: companyRequest.email,
        name: companyRequest.contact_name,
        companyName: companyRequest.company_name,
        activationUrl: activationData.activationUrl
      }).catch(err => console.error('[Email Dispatch Error]:', err.message));

      // Super Admin New Registration Alert to info@kiaantechnology.com
      emailService.sendSuperAdminNewRegistrationNotification({
        companyName: companyRequest.company_name,
        adminName: companyRequest.contact_name,
        email: companyRequest.email,
        phone: companyRequest.phone,
        planName: companyRequest.plan_name || 'Standard'
      }).catch(err => console.error('[Email Dispatch Error]:', err.message));
    } catch (emailErr) {
      console.error('[Activation Token Error]:', emailErr.message);
    }

    res.json({
      success: true,
      message: 'Company request accepted successfully. Welcome and activation email sent to HR Admin.',
      data: {
        request: { id: parseInt(id), request_status: 'accepted' },
        company: { id: employerId, company_name: companyRequest.company_name },
        admin: { id: userId, email: companyRequest.email }
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
 * Reject Company Request
 */
const rejectCompanyRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const [rows] = await db.query('SELECT * FROM company_requests WHERE id = ?', [id]);
    const companyRequest = rows[0];

    if (!companyRequest) {
      return res.status(404).json({
        success: false,
        message: 'Company request not found.',
      });
    }

    if (companyRequest.request_status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request has already been ${companyRequest.request_status}.`,
      });
    }

    await db.query(`
      UPDATE company_requests 
      SET request_status = 'rejected', processed_by = ?, processed_at = NOW(), notes = ?
      WHERE id = ?
    `, [req.user.id, notes || companyRequest.notes, id]);

    res.json({
      success: true,
      message: 'Company request rejected successfully.',
      data: {
        id: parseInt(id),
        request_status: 'rejected',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Company Request Payment Status
 */
const updateCompanyRequestPaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;

    if (!['pending', 'paid'].includes(payment_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status. Must be "pending" or "paid".',
      });
    }

    const [rows] = await db.query('SELECT * FROM company_requests WHERE id = ?', [id]);
    const companyRequest = rows[0];

    if (!companyRequest) {
      return res.status(404).json({
        success: false,
        message: 'Company request not found.',
      });
    }

    await db.query('UPDATE company_requests SET payment_status = ? WHERE id = ?', [payment_status, id]);

    // If request is accepted and payment is now paid, activate subscription
    if (companyRequest.request_status === 'accepted' && payment_status === 'paid' && companyRequest.created_company_id) {
      await db.query(
        'UPDATE subscriptions SET status = ? WHERE employer_id = ? AND status = ?',
        ['active', companyRequest.created_company_id, 'pending']
      );
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully.',
      data: {
        id: companyRequest.id,
        payment_status: payment_status,
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteCompanyRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM company_requests WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Company request not found.' });
    }

    res.json({ success: true, message: 'Company request deleted successfully.' });
  } catch (error) {
    next(error);
  }
};


// (Exports moved to the end of the file)

/**
 * Get All Payments (System Wide)
 */
/**
 * Get All Payments (System Wide)
 */
const getAllPayments = async (req, res, next) => {
  try {
    const { employer_id } = req.query;
    let query = `
      SELECT pay.*, 
             e.company_name, u.name as user_name, u.email as user_email,
             p.name as plan_name, p.price as plan_price
      FROM payments pay
      LEFT JOIN companies e ON pay.employer_id = e.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN invoices inv ON pay.invoice_id = inv.id
      LEFT JOIN plans p ON inv.plan_id = p.id
    `;

    const params = [];
    if (employer_id) {
      query += ' WHERE pay.employer_id = ?';
      params.push(employer_id);
    }
    query += ' ORDER BY pay.created_at DESC';

    const [rows] = await db.query(query, params);

    // Format to match expected Structure
    const payments = rows.map(r => ({
      ...r,
      employer: {
        id: r.employer_id, // assuming we have it from pay.*
        company_name: r.company_name,
        user: { name: r.user_name, email: r.user_email }
      },
      invoice: {
        plan: { name: r.plan_name, price: r.plan_price }
      }
    }));

    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Subscriptions (with Auto-Expire Logic)
 */
const getAllSubscriptions = async (req, res, next) => {
  try {
    const { status, employer_id } = req.query;

    // 1. AUTO-EXPIRE LOGIC: Update status of expired subscriptions
    await db.query(`
      UPDATE subscriptions 
      SET status = 'expired', updated_at = NOW() 
      WHERE status = 'active' AND end_date < NOW()
    `);

    // 2. Build Query
    let query = `
      SELECT s.*, 
             e.company_name, u.name as user_name, u.email as user_email,
             p.name as plan_name, p.duration_months as plan_duration, p.price as plan_price,
             i.status as payment_status, i.id as invoice_id
      FROM subscriptions s
      LEFT JOIN companies e ON s.employer_id = e.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN plans p ON s.plan_id = p.id
      LEFT JOIN invoices i ON s.id = i.subscription_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }
    if (employer_id) {
      query += ' AND s.employer_id = ?';
      params.push(employer_id);
    }

    query += ' ORDER BY s.created_at DESC';

    const [rows] = await db.query(query, params);

    // Format
    const subscriptions = rows.map(r => ({
      ...r,
      employer: {
        id: r.employer_id,
        company_name: r.company_name,
        user: { name: r.user_name, email: r.user_email }
      },
      plan: {
        name: r.plan_name,
        duration_months: r.plan_duration,
        price: r.plan_price
      },
      payment: {
        invoice_id: r.invoice_id,
        status: r.payment_status || 'pending'
      }
    }));

    res.json({ success: true, data: subscriptions });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate a pending subscription and record payment
 */
const activateSubscription = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { id } = req.params;

    // 1. Fetch subscription details to check current status and plan duration
    const [subRows] = await connection.query(
      `SELECT s.*, p.duration_months, p.price as plan_price 
       FROM subscriptions s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.id = ?`,
      [id]
    );

    const subscription = subRows[0];
    if (!subscription) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    // Check if already paid to prevent duplicate records
    const [payCheck] = await connection.query(
      'SELECT id FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE subscription_id = ?)',
      [id]
    );
    if (payCheck.length > 0) {
      // If already paid, check if invoice is also marked as paid
      await connection.query("UPDATE invoices SET status = 'paid', updated_at = NOW() WHERE subscription_id = ?", [id]);
      await connection.commit();
      return res.json({ success: true, message: 'Subscription is already active and paid.' });
    }

    if (subscription.status !== 'pending' && subscription.status !== 'active') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Subscription is already ${subscription.status}.` });
    }

    // 2. Only calculate and update dates if it was pending
    let startDate = subscription.start_date;
    let endDate = subscription.end_date;

    if (subscription.status === 'pending') {
      startDate = new Date();
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + (subscription.duration_months || 1));

      // 2.1 DEACTIVATE OLD PLANS: Ensure only this one is active for the company
      await connection.query(
        "UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE employer_id = ? AND status = 'active' AND id != ?",
        [subscription.employer_id, id]
      );

      // 3. Update subscription status and dates
      await connection.query(
        `UPDATE subscriptions 
         SET status = 'active', start_date = ?, end_date = ?, updated_at = NOW() 
         WHERE id = ?`,
        [startDate, endDate, id]
      );
    }

    // 4. Handle Invoice and Payment
    const [invRows] = await connection.query('SELECT id FROM invoices WHERE subscription_id = ?', [id]);
    let invoiceId = invRows[0]?.id;

    if (!invoiceId) {
      // Create invoice if it doesn't exist
      const invoiceNumber = `INV-${Date.now()}-${subscription.employer_id}`;
      const amount = subscription.plan_price || 0;
      const [invResult] = await connection.query(
        `INSERT INTO invoices (invoice_number, employer_id, subscription_id, plan_id, amount, tax_amount, total_amount, due_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'paid', NOW(), NOW())`,
        [invoiceNumber, subscription.employer_id, id, subscription.plan_id, amount, amount, new Date()]
      );
      invoiceId = invResult.insertId;
    } else {
      // Update existing invoice to 'paid'
      await connection.query("UPDATE invoices SET status = 'paid', updated_at = NOW() WHERE id = ?", [invoiceId]);
    }

    // 5. Record payment
    const amount = subscription.plan_price || 0;
    await connection.query(
      `INSERT INTO payments (invoice_id, employer_id, amount, payment_method, status, created_at, updated_at, payment_date)
       VALUES (?, ?, ?, 'Manual Approval', 'success', NOW(), NOW(), NOW())`,
      [invoiceId, subscription.employer_id, amount]
    );

    // 6. Update company status to active if it was anything else
    // Also sync the plan name in companies table
    const [planRes] = await connection.query('SELECT name FROM plans WHERE id = ?', [subscription.plan_id]);
    const planName = planRes[0]?.name || 'basic';

    await connection.query(
      'UPDATE companies SET status = "active", subscription_plan = ?, updated_at = NOW() WHERE id = ?',
      [planName, subscription.employer_id]
    );

    // 7. Update company_requests payment_status if linked
    await connection.query(
      'UPDATE company_requests SET payment_status = "paid" WHERE created_company_id = ?',
      [subscription.employer_id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Subscription activated and payment recorded successfully.',
      data: { id, status: 'active', start_date: startDate, end_date: endDate }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get All User Requests
 */
const getAllUserRequests = async (req, res, next) => {
  try {
    const query = 'SELECT * FROM user_requests ORDER BY created_at DESC';
    const [requests] = await db.query(query);

    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete User Request
 */
const deleteUserRequest = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    console.log(`[SuperAdmin API] Received delete request for ID: ${req.params.id} (Parsed: ${id})`);

    if (isNaN(id)) {
      console.warn(`[SuperAdmin API] Delete failed: Invalid ID produced from ${req.params.id}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    const query = 'DELETE FROM user_requests WHERE id = ?';
    const [result] = await db.query(query, [id]);

    console.log(`[SuperAdmin API] Delete result for ID ${id}: ${result.affectedRows} rows affected`);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Request deleted successfully'
    });
  } catch (error) {
    console.error(`[SuperAdmin API] CRITITCAL ERROR during delete for ID ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Get All Custom Plan Requests
 */
const getCustomPlanRequests = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM custom_plan_requests ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

/**
 * Update Custom Plan Request Status
 */
const updateCustomPlanRequestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await db.query('UPDATE custom_plan_requests SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    res.json({ success: true, message: `Request status updated to ${status}` });
  } catch (error) { next(error); }
};

/**
 * Delete Custom Plan Request
 */
const deleteCustomPlanRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM custom_plan_requests WHERE id = ?', [id]);
    res.json({ success: true, message: 'Custom plan request deleted successfully.' });
  } catch (error) { next(error); }
};

/**
 * ============================================================================
 * AUDIT LOGS MANAGEMENT
 * ============================================================================
 */

/**
 * Get Paginated Audit Logs with Search and Multi-Filtering
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const { page, limit, search, action, startDate, endDate, userId, role } = req.query;
    const result = await auditService.getAuditLogs({
      page,
      limit,
      search,
      action,
      startDate,
      endDate,
      userId,
      role
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Audit Logs Aggregated Statistics
 */
const getAuditStats = async (req, res, next) => {
  try {
    const stats = await auditService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Distinct Audit Action Types for Dropdown Filter
 */
const getAuditActions = async (req, res, next) => {
  try {
    const actions = await auditService.getUniqueActions();
    res.json({
      success: true,
      data: actions
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  createAdmin,
  getAllAdmins,
  getAdminDetails,
  updateAdmin,
  resetAdminPassword,
  resetAdminPasswordAlt,
  updateAdminStatus,
  deleteAdmin,
  toggleUserStatus,
  getAnalytics,
  // Plan Management
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  // Company Management
  createCompany,
  getAllCompanies,
  updateCompany,
  deleteCompany,
  assignPlanToCompany,
  toggleCompanyStatus,
  // Invoice & Payment
  generateInvoice,
  recordPayment,
  getPaymentInvoiceHistory,
  // Profile
  updateProfile,
  getProfile,
  // Company Request Management
  getAllCompanyRequests,
  getCompanyRequestById,
  acceptCompanyRequest,
  rejectCompanyRequest,
  updateCompanyRequestPaymentStatus,
  deleteCompanyRequest,

  // New Methods for Full Visibility
  getAllPayments,
  getAllSubscriptions,
  activateSubscription,

  // User Requests
  getAllUserRequests,
  deleteUserRequest,

  // Custom Plan Requests
  getCustomPlanRequests,
  updateCustomPlanRequestStatus,
  deleteCustomPlanRequest,

  // Audit Logs
  getAuditLogs,
  getAuditStats,
  getAuditActions
};


