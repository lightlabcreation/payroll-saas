const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadmin.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication and superadmin role
router.use(authenticate);
router.use(authorize('superadmin'));

router.get('/dashboard', superadminController.getDashboard);
router.get('/analytics', superadminController.getAnalytics);

// Admin CRUD
router.post('/admins', superadminController.createAdmin);
router.get('/admins', superadminController.getAllAdmins);
router.get('/admins/:id', superadminController.getAdminDetails);
router.put('/admins/:id', superadminController.updateAdmin);
router.post('/admins/:id/reset-password', superadminController.resetAdminPassword);
router.put('/admins/:id/status', superadminController.updateAdminStatus);
router.delete('/admins/:id', superadminController.deleteAdmin);

// Alternative password reset endpoint (exact specification)
router.post('/reset-admin-password', superadminController.resetAdminPasswordAlt);

// User management
router.put('/users/:userId/status', superadminController.toggleUserStatus);

// Plan Management
router.post('/plans', superadminController.createPlan);
router.get('/plans', superadminController.getAllPlans);
router.get('/plans/:id', superadminController.getPlanById);
router.put('/plans/:id', superadminController.updatePlan);
router.delete('/plans/:id', superadminController.deletePlan);

// Company Management
router.post('/companies', superadminController.createCompany);
router.get('/companies', superadminController.getAllCompanies);
router.put('/companies/:id', superadminController.updateCompany);
router.delete('/companies/:id', superadminController.deleteCompany);
router.post('/companies/:id/assign-plan', superadminController.assignPlanToCompany);
router.put('/companies/:id/status', superadminController.toggleCompanyStatus);

// Invoice & Payment Management
router.post('/invoices', superadminController.generateInvoice);
router.post('/payments', superadminController.recordPayment);
router.get('/payments', superadminController.getAllPayments); // New: List all payments
router.get('/invoices', superadminController.getPaymentInvoiceHistory); // Existing: Invoices

// Subscriptions
router.get('/subscriptions', superadminController.getAllSubscriptions);
router.post('/subscriptions/:id/activate', superadminController.activateSubscription);

// Company Request Management
router.get('/company-requests', superadminController.getAllCompanyRequests);
router.get('/company-requests/:id', superadminController.getCompanyRequestById);
router.post('/company-requests/:id/accept', superadminController.acceptCompanyRequest);
router.post('/company-requests/:id/reject', superadminController.rejectCompanyRequest);
router.put('/company-requests/:id/payment-status', superadminController.updateCompanyRequestPaymentStatus);
router.delete('/company-requests/:id', superadminController.deleteCompanyRequest);

// User Request Management
router.get('/user-requests', superadminController.getAllUserRequests);
router.delete('/user-requests/:id', superadminController.deleteUserRequest);
router.post('/user-requests/:id/delete', superadminController.deleteUserRequest);
router.get('/user-requests/:id/delete-test', superadminController.deleteUserRequest);
// Fallback for missing ID
router.delete('/user-requests', (req, res) => res.status(400).json({ success: false, message: 'Request ID is required for deletion.' }));

// Custom Plan Request Management
router.get('/custom-plan-requests', superadminController.getCustomPlanRequests);
router.put('/custom-plan-requests/:id/status', superadminController.updateCustomPlanRequestStatus);
router.delete('/custom-plan-requests/:id', superadminController.deleteCustomPlanRequest);

const supportTicketController = require('../controllers/supportTicket.controller');
const upload = require('../middlewares/upload.middleware');
const handleTicketAttachment = (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    next();
  });
};

// Support Ticket Management (Routed to support@kiaantechnology.com)
router.get('/tickets', supportTicketController.getAllTickets);
router.post('/tickets', handleTicketAttachment, supportTicketController.createTicket);
router.post('/tickets/:id/reply', supportTicketController.addReply);
router.put('/tickets/:id/status', supportTicketController.updateTicketStatus);

// Email Logs & System Diagnostics
router.get('/email-logs', supportTicketController.getEmailLogs);
router.post('/email-test', supportTicketController.testEmailConfig);

// Audit Logs Management
router.get('/audit-logs', superadminController.getAuditLogs);
router.get('/audit-logs/stats', superadminController.getAuditStats);
router.get('/audit-logs/actions', superadminController.getAuditActions);

// Profile
router.put('/profile', superadminController.updateProfile);
router.get('/profile', superadminController.getProfile);

module.exports = router;

