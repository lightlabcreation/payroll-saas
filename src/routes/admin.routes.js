const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { checkEmployeeLimit } = require('../middlewares/planLimits.middleware');

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/dashboard-summary', adminController.getDashboardSummary);
router.get('/transactions', adminController.getTransactions);
router.delete('/transactions/:id', adminController.deleteTransaction);

// Employer CRUD
router.post('/employers', adminController.createEmployer);
router.get('/employers', adminController.getEmployers); // list employers
router.get('/employers/:id', adminController.getEmployerById); // get single employer by id
router.get('/employers/all', adminController.getAllEmployers); // Keep old one for compatibility
router.put('/employers/:id', adminController.updateEmployer);
// Credits
router.post('/credits/bulk-add', adminController.addCreditBulk);
router.post('/employers/:id/credit', adminController.addCredit);
router.get('/credits/requests', adminController.getPendingCreditRequests);
router.post('/credits/requests/:id/approve', adminController.approveCreditRequest);
router.post('/credits/requests/:id/reject', adminController.rejectCreditRequest);
router.post('/users/:id/toggle-status', adminController.toggleUserStatus);
router.delete('/employers/:id', adminController.deleteEmployer);

// Bill Company (Admin-only)
router.post('/bill-company', adminController.createBillCompany);
router.get('/bill-company', adminController.getBillCompanies);
router.put('/bill-company/:id', adminController.updateBillCompany);
router.delete('/bill-company/:id', adminController.deleteBillCompany);

// Payment Setup (Admin-only)
router.post('/payment-setup', adminController.createPaymentSetup);
router.get('/payment-setup', adminController.getPaymentSetups);
router.put('/payment-setup/:id', adminController.updatePaymentSetup);

// Employee CRUD
router.post('/employees', checkEmployeeLimit, adminController.createEmployee);
router.get('/employees', adminController.getAllEmployees); // Updated to use getAllEmployees
router.get('/employees/all', adminController.getAllEmployees); // Keep old one for compatibility
router.put('/employees/:id', adminController.updateEmployee);
router.delete('/employees/:id', adminController.deleteEmployee);

// Vendor CRUD
router.post('/vendors', adminController.createVendor);
router.get('/vendors', adminController.getAllVendors);
router.put('/vendors/:id', adminController.updateVendor);
router.delete('/vendors/:id', adminController.deleteVendor);

// Plan & Subscription
router.post('/purchase-plan', adminController.purchasePlan);
router.get('/subscription', adminController.getMySubscription);
router.get('/subscription/status', adminController.getSubscriptionStatus); // New route
router.get('/payments', adminController.getMyPayments);

// Job Portal (Admin)
router.get('/jobs', adminController.getAllJobs);
router.post('/jobs', adminController.createJob);
router.put('/jobs/:id', adminController.updateJob);
router.delete('/jobs/:id', adminController.deleteJob);

// Attendance Management
router.get('/attendance', adminController.getAttendance);
router.post('/attendance', adminController.markAttendance);

// Training Management
router.get('/trainings', adminController.getTrainings);
router.post('/trainings', adminController.createTraining);
router.post('/trainings/assign', adminController.assignTraining);
router.post('/trainings/material', adminController.uploadTrainingMaterial);
router.get('/trainings/materials', adminController.getTrainingMaterials);
router.post('/trainings/completion', adminController.markTrainingCompletion);

router.get('/trainings/results', adminController.getTrainingResults);
router.delete('/trainings/:id', adminController.deleteTraining);
router.put('/trainings/:id', adminController.updateTraining);
router.get('/trainings/:id', adminController.getTrainingById);

// Bill Companies
router.get('/bill-companies', adminController.getBillCompanies);
router.post('/bill-companies', adminController.createBillCompany);
router.put('/bill-companies/:id', adminController.updateBillCompany);
router.delete('/bill-companies/:id', adminController.deleteBillCompany);


// Payment Setup - Gateways
router.get('/payment-gateways', adminController.getPaymentGateways);
router.post('/payment-gateways', adminController.createPaymentGateway);
router.put('/payment-gateways/:id', adminController.updatePaymentGateway);
router.delete('/payment-gateways/:id', adminController.deletePaymentGateway);

// Payment Setup - Bank Accounts
router.get('/bank-accounts', adminController.getBankAccounts);
router.post('/bank-accounts', adminController.createBankAccount);
router.put('/bank-accounts/:id', adminController.updateBankAccount);
router.delete('/bank-accounts/:id', adminController.deleteBankAccount);

// Job Portal - Vacancies
router.get('/job-vacancies', adminController.getJobVacancies);
router.post('/job-vacancies', adminController.createJobVacancy);
router.put('/job-vacancies/:id', adminController.updateJobVacancy);
router.delete('/job-vacancies/:id', adminController.deleteJobVacancy);

// Job Portal - Job Seekers
router.get('/job-seekers', adminController.getJobSeekers);
router.get('/job-seekers/:id', adminController.getJobSeekerById);
router.post('/job-seekers', adminController.createJobSeeker);
router.put('/job-seekers/:id', adminController.updateJobSeeker);
router.delete('/job-seekers/:id', adminController.deleteJobSeeker);

// Support Ticket Management for HR Admin (Routed to support@kiaantechnology.com)
const supportTicketController = require('../controllers/supportTicket.controller');
const upload = require('../middlewares/upload.middleware');
const handleTicketAttachment = (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    next();
  });
};

router.get('/tickets', supportTicketController.getAllTickets);
router.post('/tickets', handleTicketAttachment, supportTicketController.createTicket);
router.post('/tickets/:id/reply', supportTicketController.addReply);

module.exports = router;

