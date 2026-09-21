const { verifyToken } = require('../utils/jwt');
const db = require('../config/mysql');

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please login again.',
      });
    }

    // Fetch user from database
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [decoded.id]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact administrator.',
      });
    }

    // Remove password from user object
    delete user.password;

    // Attach user to request
    req.user = user;

    // If user is employer, fetch employer details and attach
    if (user.role === 'employer') {
      const [empRows] = await db.query(
        'SELECT * FROM employers WHERE user_id = ? LIMIT 1',
        [user.id]
      );
      const employer = empRows[0];
      if (employer) {
        req.employer = employer;
      }
    }


    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.',
    });
  }
};

/**
 * Authorization Middleware
 * Checks if user has required role(s)
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const userRole = req.user.role.toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
      console.warn(`[AUTH] Access denied for user ${req.user.id}. Role: ${req.user.role}. Required: ${allowedRoles.join(', ')}`);
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Middleware Access Gate: Enforces active subscription status
 * Throws 403 Forbidden with code 'SUBSCRIPTION_EXPIRED' if expired
 */
const enforceActiveSubscription = (req, res, next) => {
  if (req.user && req.user.role === 'employer' && req.employer) {
    const subStatus = (req.employer.subscription_status || req.employer.status || '').toLowerCase();
    if (subStatus === 'expired' || subStatus === 'inactive' || subStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your subscription has expired. Please renew your plan to continue accessing HR & Payroll operations.',
        expiryDate: req.employer.expiry_date || req.employer.end_date || null
      });
    }
  }
  next();
};

module.exports = { authenticate, authorize, enforceActiveSubscription };

