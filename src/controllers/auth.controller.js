const { generateTokens, verifyToken } = require('../utils/jwt');
const db = require('../config/mysql');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { getLoginRedirect, getDashboardRoute } = require('../middlewares/role.middleware');
const emailService = require('../services/email.service');
const activationService = require('../services/activation.service');
const auditService = require('../services/audit.service');

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { name, email, password, role, phone } = req.body;

    // Validate input
    if (!name || !email || !password) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.',
      });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const [existingUser] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists.',
      });
    }

    // Validate role
    const allowedRoles = ['employer', 'employee', 'vendor', 'jobseeker'];
    const userRole = role && allowedRoles.includes(role.toLowerCase())
      ? role.toLowerCase()
      : 'jobseeker';

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [userResult] = await connection.query(
      `INSERT INTO users (name, email, password, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
      [name.trim(), normalizedEmail, hashedPassword, userRole]
    );
    const userId = userResult.insertId;

    // Create role-specific records
    if (userRole === 'employer') {
      await connection.query(
        `INSERT INTO employers (user_id, company_name, status, created_at, updated_at)
         VALUES (?, ?, 'active', NOW(), NOW())`,
        [userId, `${name}'s Company`]
      );
    } else if (userRole === 'employee') {
      await connection.query(
        `INSERT INTO employees (user_id, status, created_at, updated_at)
         VALUES (?, 'active', NOW(), NOW())`,
        [userId]
      );
    } else if (userRole === 'vendor') {
      await connection.query(
        `INSERT INTO vendors (user_id, company_name, payment_status, status, created_at, updated_at)
         VALUES (?, ?, 'pending', 'active', NOW(), NOW())`,
        [userId, `${name}'s Vendor Company`]
      );
    } else if (userRole === 'jobseeker') {
      await connection.query(
        `INSERT INTO job_seekers (user_id, name, email, phone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
        [userId, name, email, phone || null]
      );
    }

    await connection.commit();

    const user = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      role: userRole,
      status: 'active'
    };

    // Generate tokens
    const tokens = generateTokens(user);

    // Send Welcome Email via Brevo asynchronously
    emailService.sendWelcomeEmail({
      email: normalizedEmail,
      name: name.trim(),
      companyName: `${name}'s Company`,
      planName: userRole.toUpperCase() + ' Account'
    }).catch(err => console.error('[BREVO] Error sending registration welcome email:', err.message));

    // Audit Log Registration
    auditService.log({
      userId: userId,
      action: 'USER_REGISTER',
      details: `New ${userRole.toUpperCase()} registered: ${name.trim()} (${normalizedEmail})`,
      ipAddress: req.ip || req.socket?.remoteAddress
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[REGISTER] Error:', error.message);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Normalize email (trim whitespace)
    const normalizedEmail = email.trim();

    // 1. Fetch User (SQL)
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    let user = rows[0];

    // Fallback: case-insensitive lookup
    if (!user) {
      const [rows2] = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
      user = rows2[0];
    }

    // Safe debug log
    if (!user) {
      console.log(`[LOGIN] User not found for email: ${normalizedEmail}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    console.log(`[LOGIN] User found: ${user.email} (ID: ${user.id}, Role: ${user.role})`);

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(`[LOGIN] Password mismatch for user: ${user.email} (ID: ${user.id})`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact administrator.',
      });
    }

    // Check Subscription Expiry for Employer Accounts
    if (user.role === 'employer') {
      const [empRows] = await db.query(
        `SELECT e.id, e.status, s.status as subscription_status, s.end_date 
         FROM employers e 
         LEFT JOIN subscriptions s ON e.id = s.employer_id AND s.status = 'active'
         WHERE e.user_id = ?`,
        [user.id]
      );
      if (empRows.length > 0) {
        const emp = empRows[0];
        const isExpired = emp.subscription_status === 'expired' || 
                          (emp.end_date && new Date(emp.end_date) <= new Date());
        if (isExpired) {
          await db.query("UPDATE employers SET status = 'inactive' WHERE id = ?", [emp.id]);
          await db.query("UPDATE subscriptions SET status = 'expired' WHERE employer_id = ?", [emp.id]);
          return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_EXPIRED',
            message: 'Your 7-Day Free Trial / Subscription Plan has expired. Please purchase a plan to continue accessing the system.',
            redirectTo: '/#pricing'
          });
        }
      }
    }

    // Update last login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Generate tokens
    const tokens = generateTokens(user);

    console.log(`[LOGIN] Successful login for: ${user.email} (Role: ${user.role})`);

    // Audit Log Login
    auditService.log({
      userId: user.id,
      action: 'USER_LOGIN',
      details: `${user.role ? user.role.toUpperCase() : 'USER'} logged in successfully: ${user.name || user.email}`,
      ipAddress: req.ip || req.socket?.remoteAddress
    });

    // Get role-based dashboard redirect
    const redirectInfo = getLoginRedirect(user.role);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        // CRITICAL: Dashboard route based on role
        dashboardRoute: redirectInfo.dashboard,
        redirectMessage: redirectInfo.message
      },
    });
  } catch (error) {
    console.error('[LOGIN] Error:', error.message);
    next(error);
  }
};

/**
 * Admin Specialized Login
 */
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND role IN ("admin", "superadmin")', [email.trim()]);
    let user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Admin account is inactive.' });
    }

    const tokens = generateTokens(user);
    const redirectInfo = getLoginRedirect(user.role);

    auditService.log({
      userId: user.id,
      action: 'ADMIN_LOGIN',
      details: `Admin logged in: ${user.name} (${user.email})`,
      ipAddress: req.ip || req.socket?.remoteAddress
    });

    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        dashboardRoute: redirectInfo.dashboard
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required.',
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token.',
      });
    }

    // Find user using Pure SQL
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    const user = rows[0];

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive.',
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    res.json({
      success: true,
      message: 'Token refreshed successfully.',
      data: tokens,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout user
 */
const logout = async (req, res) => {
  // Since we're using stateless JWT, logout is handled client-side
  // In a production app, you might want to maintain a blacklist of tokens
  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
};


/**
 * Change Password (Authenticated User)
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new passwords are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect current password.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, userId]);

    auditService.log({
      userId: userId,
      action: 'PASSWORD_CHANGE',
      details: `User (${user.email}) changed password successfully`,
      ipAddress: req.ip || req.socket?.remoteAddress
    });

    res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

const sendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Verify user exists in database
    const [users] = await db.query('SELECT id, name, email FROM users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
    const user = users[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });
    }

    // 2. Generate 6-digit numeric OTP
    const otpNumber = crypto.randomInt(100000, 999999).toString();

    // 3. Hash OTP using SHA256
    const otpHash = crypto.createHash('sha256').update(otpNumber).digest('hex');

    // 4. Calculate Expiry: NOW() + 10 Minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const id = crypto.randomUUID();

    // 5. Invalidate existing active tokens & save new token in DB
    await db.query('DELETE FROM password_reset_tokens WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
    await db.query(
      'INSERT INTO password_reset_tokens (id, email, otp_hash, expires_at, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, normalizedEmail, otpHash, expiresAt]
    );

    // 6. Log OTP to terminal console for instant dev testing & send OTP Email via Brevo API
    console.log(`\n==================================================`);
    console.log(`🔑 [FORGOT PASSWORD OTP GENERATED]`);
    console.log(`   Recipient : ${user.email}`);
    console.log(`   OTP Code  : ${otpNumber}`);
    console.log(`==================================================\n`);

    const emailResult = await emailService.sendPasswordResetOTPEmail({
      email: user.email,
      name: user.name,
      otp: otpNumber
    }).catch(err => {
      console.error('⚠️ [BREVO OTP EMAIL ERROR]:', err.message);
      return { success: false, error: err.message };
    });

    if (emailResult && emailResult.success) {
      return res.json({
        success: true,
        message: 'OTP verification code sent successfully to your email address.'
      });
    } else {
      console.warn(`⚠️ [OTP EMAIL NOT DELIVERED] Email to ${user.email} failed. Displaying Dev OTP for local testing.`);
      return res.json({
        success: true,
        message: `OTP Code generated! (Dev OTP Verification Code: ${otpNumber})`
      });
    }
  } catch (error) {
    console.error('[SEND_OTP_ERROR]', error);
    next(error);
  }
};

const verifyReset = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Enforce Password Rules: min 8 chars, 1 uppercase, 1 number
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least one uppercase letter and one number.' });
    }

    // Hash provided OTP to compare
    const providedHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');

    // Look up valid token
    const [tokens] = await db.query(
      'SELECT * FROM password_reset_tokens WHERE LOWER(email) = LOWER(?) AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail]
    );

    const tokenRecord = tokens[0];
    if (!tokenRecord || tokenRecord.otp_hash !== providedHash) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code.' });
    }

    // Hash new password using bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update User Password in DB
    await db.query('UPDATE users SET password = ?, updated_at = NOW() WHERE LOWER(email) = LOWER(?)', [hashedPassword, normalizedEmail]);

    // Delete used OTP record to prevent replay attacks
    await db.query('DELETE FROM password_reset_tokens WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);

    // Find user ID for audit log
    const [userRows] = await db.query('SELECT id, name FROM users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
    const resetUserId = userRows.length > 0 ? userRows[0].id : null;

    auditService.log({
      userId: resetUserId,
      action: 'PASSWORD_RESET',
      details: `Password was reset successfully for account (${normalizedEmail})`,
      ipAddress: req.ip || req.socket?.remoteAddress
    });

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('[VERIFY_RESET_ERROR]', error);
    next(error);
  }
};

/**
 * Verify Password Setup / Account Activation Token
 */
const verifySetupToken = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Activation token is required.' });
    }

    const verification = await activationService.verifyPasswordSetupToken(token);
    if (!verification.valid) {
      return res.status(400).json({ success: false, message: verification.message });
    }

    return res.json({
      success: true,
      email: verification.tokenData.email,
      message: 'Token is valid.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete Password Setup / Account Activation
 */
const setupPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    const activatedUser = await activationService.consumePasswordSetupToken(token, password);

    return res.json({
      success: true,
      message: 'Account activated and password established successfully.',
      data: {
        id: activatedUser.id,
        email: activatedUser.email,
        name: activatedUser.name,
        role: activatedUser.role
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  adminLogin,
  refreshToken,
  logout,
  changePassword,
  forgotPassword: sendOTP,
  sendOTP,
  verifyReset,
  verifySetupToken,
  setupPassword,
};

