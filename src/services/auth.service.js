/**
 * Pure SQL Authentication Service

 *
 * Purpose: Handle all user/password operations with raw SQL
 * to ensure passwords are properly hashed and controlled
 */

const bcrypt = require('bcrypt');
const mysql = require('../config/mysql');

class AuthService {
  /**
   * Create a new user with hashed password
   * @param {Object} userData - User data
   * @param {string} userData.name - User's full name
   * @param {string} userData.email - User's email
   * @param {string} userData.password - Plain text password (will be hashed)
   * @param {string} userData.role - User role (superadmin, admin, employer, employee, vendor, jobseeker)
   * @param {string} [userData.phone] - Optional phone number
   * @param {number} [userData.company_id] - Optional company ID
   * @param {string} [userData.status='active'] - User status
   * @returns {Promise<Object>} Created user object with id
   */
  async createUser(userData) {
    const {
      name,
      email,
      password,
      role,
      phone = null,
      company_id = null,
      status = 'active'
    } = userData;

    // Validate required fields
    if (!name || !email || !password || !role) {
      throw new Error('Name, email, password, and role are required');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const query = `
      INSERT INTO users (name, email, password, phone, role, company_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const [result] = await mysql.query(query, [
      name.trim(),
      email.toLowerCase().trim(),
      hashedPassword,
      phone,
      role,
      company_id,
      status
    ]);

    // Return created user
    return {
      id: result.insertId,
      name,
      email: email.toLowerCase().trim(),
      role,
      phone,
      company_id,
      status
    };
  }

  /**
   * Update user password (used by Super Admin for password resets)
   * @param {number} userId - User ID
   * @param {string} newPassword - New plain text password (will be hashed)
   * @returns {Promise<boolean>} Success status
   */
  async updatePassword(userId, newPassword) {
    if (!userId || !newPassword) {
      throw new Error('User ID and new password are required');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const query = `
      UPDATE users
      SET password = ?, updated_at = NOW()
      WHERE id = ?
    `;

    const [result] = await mysql.query(query, [hashedPassword, userId]);

    return result.affectedRows > 0;
  }

  /**
   * Verify user password during login
   * @param {string} email - User email
   * @param {string} password - Plain text password to verify
   * @returns {Promise<Object|null>} User object if valid, null otherwise
   */
  async verifyLogin(email, password) {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Get user by email
    const query = `
      SELECT id, name, email, phone, password, role, company_id, status, last_login
      FROM users
      WHERE LOWER(email) = LOWER(?)
    `;

    const [rows] = await mysql.query(query, [email.trim()]);
    const user = rows[0];

    if (!user) {
      return null;
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new Error('Your account has been blocked. Please contact administrator.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    // Update last login
    await mysql.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user by ID
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} User object without password
   */
  async getUserById(userId) {
    const query = `
      SELECT id, name, email, phone, role, company_id, status, last_login, created_at, updated_at
      FROM users
      WHERE id = ?
    `;

    const [rows] = await mysql.query(query, [userId]);
    return rows[0] || null;
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object without password
   */
  async getUserByEmail(email) {
    const query = `
      SELECT id, name, email, phone, role, company_id, status, last_login, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER(?)
    `;

    const [rows] = await mysql.query(query, [email.trim()]);
    return rows[0] || null;
  }

  /**
   * Check if email already exists
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if exists
   */
  async emailExists(email) {
    const query = `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`;
    const [rows] = await mysql.query(query, [email.trim()]);
    return rows.length > 0;
  }

  /**
   * Update user status (active/blocked)
   * @param {number} userId - User ID
   * @param {string} status - New status ('active' or 'blocked')
   * @returns {Promise<boolean>} Success status
   */
  async updateUserStatus(userId, status) {
    if (!['active', 'blocked'].includes(status)) {
      throw new Error('Invalid status. Must be "active" or "blocked"');
    }

    const query = `
      UPDATE users
      SET status = ?, updated_at = NOW()
      WHERE id = ?
    `;

    const [result] = await mysql.query(query, [status, userId]);
    return result.affectedRows > 0;
  }
}

module.exports = new AuthService();
