/**
 * Kiaan Technology Pvt Ltd - Payroll & HRMS SaaS Plan Limits
 */

const PLAN_LIMITS = {
  trial: {
    name: "FREE TRIAL",
    maxEmployees: 10,
    jobPortalAccess: false,
    multiBranchAccess: false,
    vendorPayrollAccess: false,
    durationDays: 7,
  },
  basic: {
    name: "BASIC PLAN",
    maxEmployees: 20,
    jobPortalAccess: true,
    multiBranchAccess: false,
    vendorPayrollAccess: false,
    durationDays: 30,
  },
  professional: {
    name: "PROFESSIONAL PLAN",
    maxEmployees: 40,
    jobPortalAccess: true,
    multiBranchAccess: false,
    vendorPayrollAccess: false,
    durationDays: 30,
  },
  enterprise: {
    name: "ENTERPRISE PLAN",
    maxEmployees: 50,
    jobPortalAccess: true,
    multiBranchAccess: true,
    vendorPayrollAccess: true,
    durationDays: 30,
  },
  custom: {
    name: "OTHER / TAILORED",
    maxEmployees: 999999, // Unlimited
    jobPortalAccess: true,
    multiBranchAccess: true,
    vendorPayrollAccess: true,
    durationDays: 365,
  }
};

const getPlanLimits = (planId) => {
  const key = (planId || 'trial').toLowerCase();
  return PLAN_LIMITS[key] || PLAN_LIMITS.trial;
};

module.exports = {
  PLAN_LIMITS,
  getPlanLimits
};
