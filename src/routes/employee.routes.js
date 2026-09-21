
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication and employee role
router.use(authenticate);
router.use(authorize('employee'));

// 1. Dashboard
router.get('/dashboard', employeeController.getDashboard);

// 2. Profile
router.get('/profile', employeeController.getProfile);
router.put('/profile/update', employeeController.updateProfile);

// 3. Wallet & Salary
router.get('/wallet', employeeController.getWallet);
router.get('/salary/list', employeeController.getSalaryHistory); // Alias for salary list

// 4. Bills & Payments
router.post('/bill/create', employeeController.createBill);
router.post('/bill/pay', employeeController.payBill);
router.get('/bill/list', employeeController.getBills);

// 5. Attendance
router.post('/check-in', employeeController.checkIn);
router.post('/check-out', employeeController.checkOut);
router.get('/attendance/list', employeeController.getAttendance);

// 6. Training
router.get('/training/list', employeeController.getTrainings);

// 7. Assignments, Tests & Certificates
router.get('/tests', employeeController.getTests);
router.get('/certificates', employeeController.getCertificates);

// 8. Bank Details
router.post('/bank/add', employeeController.addBankDetails);
router.get('/bank/list', employeeController.getBankDetails);

// 9. Transactions
router.get('/transactions', employeeController.getTransactions);

// 10. Job Applications
router.get('/job/applications', employeeController.getMyApplications);
router.get('/jobs', employeeController.getAllJobs); // Public jobs or specific new jobs
router.post('/job/apply/:jobId', employeeController.applyForJob);

module.exports = router;
