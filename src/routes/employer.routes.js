const express = require('express');
const router = express.Router();
const employerController = require('../controllers/employer.controller');
const { validateCreateJob, validateUpdateJob } = require('../validations/job.validation');
const { authenticate, authorize, enforceActiveSubscription } = require('../middlewares/auth.middleware');
const { checkEmployeeLimit } = require('../middlewares/planLimits.middleware');

// All routes require authentication and employer role
router.use(authenticate);
router.use(authorize('employer'));
router.use(enforceActiveSubscription);

router.get('/dashboard', employerController.getDashboard);

// Credit & Transaction APIs
router.get('/credit-balance', employerController.getCreditBalance);
router.post('/employees/:employeeId/credit', employerController.assignCreditToEmployee);
router.get('/employees/:employeeId/credit-history', employerController.getEmployeeCreditHistory);
router.get('/transactions', employerController.getTransactions);
router.get('/beneficiaries', employerController.getBeneficiaries);
router.get('/credit-history', employerController.getCreditHistory);
router.get('/transaction-chart', employerController.getTransactionChart);
router.post('/request-credit', employerController.requestCredit);

// Job CRUD
router.get('/jobs', employerController.getAllJobs);
router.post('/jobs', validateCreateJob, employerController.createJob);
router.get('/jobs/:id', employerController.getJobById);
router.put('/jobs/:id', validateUpdateJob, employerController.updateJob);
router.delete('/jobs/:id', employerController.deleteJob);

// Job Applications
router.get('/jobs/:jobId/applications', employerController.getJobApplications);
router.put('/applications/:applicationId/status', employerController.updateApplicationStatus);

// Employee Management
router.get('/employees', employerController.getMyEmployees);
router.post('/employees', checkEmployeeLimit, employerController.addEmployee);
router.put('/employees/:employeeId', employerController.updateEmployee);
router.delete('/employees/:employeeId', employerController.deleteEmployee);

// Vendor Management
router.get('/vendors', employerController.getMyVendors);
router.post('/vendors', employerController.addVendor);
router.put('/vendors/:vendorId', employerController.updateVendor);

// Attendance Management
router.get('/employees/:employeeId/attendance', employerController.getEmployeeAttendance);
router.post('/employees/:employeeId/attendance', employerController.markAttendance);

// Training Management
router.post('/trainings', employerController.createTraining);
router.get('/trainings', employerController.getAllTrainings);
router.post('/trainings/:trainingId/assign', employerController.assignTrainingToEmployees);

// Payment Management
router.post('/employees/:employeeId/pay-salary', employerController.paySalary);
router.post('/vendors/:vendorId/pay', employerController.payVendor);

// WhatsApp Connectivity (Employer)
const whatsappController = require('../controllers/whatsapp.controller');
router.get('/whatsapp/status', whatsappController.getStatus);
router.post('/whatsapp/connect', whatsappController.connect);
router.post('/whatsapp/disconnect', whatsappController.disconnect);
router.put('/whatsapp/preferences', whatsappController.updatePreferences);
router.post('/whatsapp/test', whatsappController.sendTestMessage);
router.get('/whatsapp/logs', whatsappController.getLogs);

module.exports = router;
