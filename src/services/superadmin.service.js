/**
 * Super Admin Service - Pure SQL
 * Handles company and admin management for enterprise SaaS
 *
 * Role Hierarchy:
 * Super Admin → Admin (Company Admin) → Company (Employer) → Employees
 */

const mysql = require('../config/mysql');
const authService = require('./auth.service');
const emailService = require('./email.service');
const activationService = require('./activation.service');

class SuperAdminService {
  /**
   * Create Company with Admin
   * Super Admin creates a company and assigns/creates an admin to manage it
   *
   * @param {Object} companyData - Company information
   * @param {string} companyData.company_name - Company name
   * @param {string} companyData.company_address - Company address
   * @param {string} [companyData.gst_number] - GST number
   * @param {string} [companyData.pan_number] - PAN number
   * @param {string} [companyData.subscription_plan] - Subscription plan
   * @param {Object} adminData - Admin user information
   * @param {string} adminData.name - Admin's name
   * @param {string} adminData.email - Admin's email
   * @param {string} adminData.password - Admin's password (plain text, will be hashed)
   * @param {string} [adminData.phone] - Admin's phone
   * @param {number} createdBySuperAdminId - Super Admin ID who is creating this
   * @returns {Promise<Object>} Created company and admin details
   */
  async createCompanyWithAdmin(companyData, adminData, createdBySuperAdminId) {
    const connection = await mysql.getConnection();
    await connection.beginTransaction();

    try {
      // CRITICAL VALIDATION: Super Admin can ONLY create ADMIN role
      // Never allow employee, employer, vendor, or jobseeker creation here
      if (adminData.role && adminData.role !== 'admin') {
        throw new Error('FORBIDDEN: Super Admin can only create ADMIN role. Employee/Employer creation is not allowed.');
      }

      // 1. Check if admin email already exists
      const emailExists = await authService.emailExists(adminData.email);
      if (emailExists) {
        throw new Error(`Email ${adminData.email} is already registered`);
      }

      // 2. Create Admin User (STRICTLY ADMIN ROLE ONLY)
      const adminUser = await authService.createUser({
        name: adminData.name,
        email: adminData.email,
        password: adminData.password,
        phone: adminData.phone || null,
        role: 'admin', // HARDCODED - Super Admin can ONLY create admin role
        status: 'active'
      });

      // 3. Create Admin record in admins table
      const [adminRecordResult] = await connection.query(
        `INSERT INTO admins (user_id, created_by, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [adminUser.id, createdBySuperAdminId]
      );

      const adminRecordId = adminRecordResult.insertId;

      // 4. Create Company (Employer record)
      const [companyResult] = await connection.query(
        `INSERT INTO companies
         (user_id, company_name, company_address, gst_number, pan_number,
          subscription_plan, admin_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
        [
          adminUser.id,
          companyData.company_name,
          companyData.company_address || null,
          companyData.gst_number || null,
          companyData.pan_number || null,
          companyData.subscription_plan || 'basic',
          adminRecordId
        ]
      );

      const companyId = companyResult.insertId;

      // 5. Link admin user to company
      await connection.query(
        `UPDATE users SET company_id = ? WHERE id = ?`,
        [companyId, adminUser.id]
      );

      await connection.commit();

      // 6. Generate Password Setup Token & Trigger Email Notifications
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      try {
        const tokenData = await activationService.generatePasswordSetupToken(adminUser.id, adminUser.email, 24);

        // A. Send HR Admin Welcome Email with Credentials & Activation Options
        await emailService.sendHRAdminWelcomeActivationEmail({
          email: adminUser.email,
          name: adminUser.name,
          password: adminData.password,
          companyName: companyData.company_name,
          portalUrl: frontendUrl,
          activationUrl: tokenData.activationUrl,
          expiresHours: 24
        });

        // B. Send Super Admin Notification to info@kiaantechnology.com
        await emailService.sendSuperAdminNewRegistrationNotification({
          companyName: companyData.company_name,
          adminName: adminUser.name,
          email: adminUser.email,
          phone: adminData.phone || 'N/A',
          createdAt: new Date().toLocaleString(),
          status: 'active',
          planName: companyData.subscription_plan || 'Standard',
          activationStatus: 'Token Issued & Sent'
        });
      } catch (emailErr) {
        console.error('⚠️ Post-creation email notification warning:', emailErr.message);
      }

      return {
        success: true,
        company: {
          id: companyId,
          company_name: companyData.company_name,
          admin_id: adminRecordId
        },
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: 'admin'
        }
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all admins (Company Admins & Employers)
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} { admins: Array, stats: Object }
   */
  async getAllAdmins(filters = {}) {
    let query = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.last_login,
        u.created_at,
        a.id as admin_record_id,
        c.id as company_id,
        COALESCE(c.company_name, emp.company_name, 'N/A') as company_name,
        COALESCE(c.subscription_plan, emp.subscription_plan, 'Standard') as subscription_plan
      FROM users u
      LEFT JOIN admins a ON u.id = a.user_id
      LEFT JOIN companies c ON (c.admin_id = a.id OR c.user_id = u.id)
      LEFT JOIN employers emp ON emp.user_id = u.id
      WHERE u.role IN ('admin', 'employer')
    `;

    const params = [];

    if (filters.status) {
      query += ` AND u.status = ?`;
      params.push(filters.status);
    }

    query += ` ORDER BY u.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(filters.limit));

      if (filters.offset) {
        query += ` OFFSET ?`;
        params.push(parseInt(filters.offset));
      }
    }

    const [rows] = await mysql.query(query, params);

    // Fetch summary statistics directly from database
    const [[statsRow]] = await mysql.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status IN ('suspended', 'blocked') THEN 1 ELSE 0 END) as suspended
      FROM users
      WHERE role IN ('admin', 'employer')
    `);

    return {
      admins: rows,
      stats: {
        total: Number(statsRow?.total || 0),
        active: Number(statsRow?.active || 0),
        inactive: Number(statsRow?.inactive || 0),
        suspended: Number(statsRow?.suspended || 0)
      }
    };
  }

  /**
   * Get all companies with their admin details
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} List of companies
   */
  async getAllCompanies(filters = {}) {
    let query = `
      SELECT
        c.id,
        c.company_name,
        c.company_address,
        c.gst_number,
        c.pan_number,
        c.subscription_plan,
        c.status,
        c.created_at,
        u.id as admin_user_id,
        u.name as admin_name,
        u.email as admin_email,
        u.phone as admin_phone,
        u.status as admin_status
      FROM companies c
      INNER JOIN admins a ON c.admin_id = a.id
      INNER JOIN users u ON a.user_id = u.id
      WHERE u.role = 'admin'
    `;

    const params = [];

    if (filters.status) {
      query += ` AND c.status = ?`;
      params.push(filters.status);
    }

    query += ` ORDER BY c.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(filters.limit));
    }

    const [rows] = await mysql.query(query, params);
    return rows;
  }

  /**
   * Reset Admin Password (Super Admin privilege)
   * @param {number} adminUserId - Admin user ID
   * @param {string} newPassword - New password (plain text, will be hashed)
   * @param {number} superAdminId - Super Admin ID performing the reset
   * @returns {Promise<Object>} Success status
   */
  async resetAdminPassword(adminUserId, newPassword, superAdminId) {
    // Verify user is an admin
    const admin = await authService.getUserById(adminUserId);

    if (!admin) {
      throw new Error('Admin user not found');
    }

    if (admin.role !== 'admin' && admin.role !== 'employer') {
      throw new Error('User is not an admin or employer');
    }

    // Update password
    const success = await authService.updatePassword(adminUserId, newPassword);

    if (success) {
      // Log the password reset action
      await mysql.query(
        `INSERT INTO system_logs (action, performed_by, target_user_id, details, created_at)
         VALUES ('ADMIN_PASSWORD_RESET', ?, ?, ?, NOW())`,
        [
          superAdminId,
          adminUserId,
          JSON.stringify({ admin_email: admin.email })
        ]
      ).catch(() => {
        // Ignore if system_logs table doesn't exist
      });
    }

    return {
      success,
      message: success ? 'Admin password reset successfully' : 'Password reset failed'
    };
  }

  /**
   * Block/Unblock Admin
   * @param {number} adminUserId - Admin user ID
   * @param {string} status - New status ('active' or 'blocked')
   * @returns {Promise<boolean>} Success status
   */
  async updateAdminStatus(adminUserId, status) {
    const admin = await authService.getUserById(adminUserId);

    if (!admin) {
      throw new Error('Admin user not found');
    }

    if (admin.role !== 'admin' && admin.role !== 'employer') {
      throw new Error('User is not an admin or employer');
    }

    return await authService.updateUserStatus(adminUserId, status);
  }

  /**
   * Get Admin details with company info
   * @param {number} adminUserId - Admin user ID
   * @returns {Promise<Object>} Admin details
   */
  async getAdminDetails(adminUserId) {
    const query = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.last_login,
        u.created_at,
        c.id as company_id,
        c.company_name,
        c.company_address,
        c.subscription_plan,
        c.status as company_status
      FROM users u
      LEFT JOIN admins a ON u.id = a.user_id
      LEFT JOIN companies c ON c.admin_id = a.id
      WHERE u.id = ? AND u.role = 'admin'
    `;

    const [rows] = await mysql.query(query, [adminUserId]);
    return rows[0] || null;
  }
}

module.exports = new SuperAdminService();
