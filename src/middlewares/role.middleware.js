/**
 * Role-based Authorization Middleware
 * STRICT ENFORCEMENT: Each role can ONLY access their designated dashboard
 *
 * CRITICAL RULES:
 * - Super Admin → Super Admin Dashboard ONLY
 * - Admin → Admin Dashboard ONLY (NEVER Employee dashboard)
 * - Employer → Employer Dashboard ONLY
 * - Employee → Employee Dashboard ONLY
 */

/**
 * Basic role authorization (allows multiple roles)
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to access this resource.',
      });
    }

    next();
  };
};

/**
 * Get dashboard route based on user role
 * @param {string} role - User role
 * @returns {string} Dashboard route
 */
const getDashboardRoute = (role) => {
  const dashboardMap = {
    'superadmin': '/superadmin/dashboard',
    'admin': '/admin/dashboard',        // Admin gets ADMIN dashboard ONLY
    'employer': '/employer/dashboard',
    'employee': '/employee/dashboard',
    'vendor': '/vendor/dashboard',
    'jobseeker': '/jobseeker/dashboard'
  };

  return dashboardMap[role] || '/';
};

/**
 * Middleware: Ensure ONLY admins (company admins) can access admin routes
 * Prevents Employee/Employer from accessing admin panel
 */
const ensureAdminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'FORBIDDEN: Only ADMIN role can access this resource.',
      yourRole: req.user.role,
      requiredRole: 'admin'
    });
  }
  next();
};

/**
 * Middleware: Ensure ONLY superadmin can access superadmin routes
 */
const ensureSuperAdminOnly = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'FORBIDDEN: Only SUPER ADMIN can access this resource.',
      yourRole: req.user.role,
      requiredRole: 'superadmin'
    });
  }
  next();
};

/**
 * Get login redirect info based on role
 * Called after successful login to determine where to send user
 */
const getLoginRedirect = (role) => {
  return {
    role: role,
    dashboard: getDashboardRoute(role),
    message: `Login successful. Redirecting to ${role} dashboard.`
  };
};

module.exports = authorize;

// Export additional functions
module.exports.authorize = authorize;
module.exports.getDashboardRoute = getDashboardRoute;
module.exports.ensureAdminOnly = ensureAdminOnly;
module.exports.ensureSuperAdminOnly = ensureSuperAdminOnly;
module.exports.getLoginRedirect = getLoginRedirect;

