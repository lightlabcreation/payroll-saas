const db = require('../config/mysql');

/**
 * Plan Limits Enforcement Middleware
 * Verifies active employee limit against company's subscription plan (max_employees)
 */
const checkEmployeeLimit = async (req, res, next) => {
  try {
    const companyId = req.user?.company_id || req.employer?.id;

    if (!companyId) {
      return next(); // Pass through if user does not belong to a corporate company
    }

    // 1. Fetch current active subscription & plan limits for company
    const [rows] = await db.query(
      `SELECT c.company_name, c.subscription_plan, p.max_employees
       FROM companies c
       LEFT JOIN subscriptions s ON c.id = s.employer_id AND s.status = 'active'
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE c.id = ?`,
      [companyId]
    );

    const company = rows[0];

    if (!company) {
      return next();
    }

    // Unlimited employees allowed if max_employees is null
    if (company.max_employees === null || company.max_employees === undefined) {
      return next();
    }

    // 2. Count existing active employees in this company
    const [[{ active_count }]] = await db.query(
      'SELECT COUNT(*) as active_count FROM employees WHERE company_id = ? AND status = "active"',
      [companyId]
    );

    // 3. Enforce limit boundary
    if (active_count >= company.max_employees) {
      return res.status(403).json({
        success: false,
        code: 'LIMIT_EXCEEDED',
        message: `Employee quota limit reached! Your current active plan "${company.subscription_plan || 'Basic'}" allows a maximum of ${company.max_employees} staff members. Please upgrade your SaaS plan in Super Admin panel to add more employees.`,
        currentCount: active_count,
        allowedLimit: company.max_employees
      });
    }

    next();
  } catch (error) {
    console.error('[PLAN LIMIT CHECK ERROR]:', error);
    next(error);
  }
};

module.exports = { checkEmployeeLimit };
