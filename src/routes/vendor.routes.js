const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendor.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication and vendor/admin role
router.use(authenticate);
router.use(authorize('vendor', 'admin', 'superadmin'));

router.get('/dashboard', vendorController.getDashboard);
router.get('/payment-status', vendorController.getPaymentStatus);
router.get('/payments', vendorController.getMyPayments);
router.put('/contract-details', vendorController.updateContractDetails);

// Bank Accounts
router.get('/bank-accounts', vendorController.getBankAccounts);
router.post('/bank-accounts', vendorController.createBankAccount);
router.delete('/bank-accounts/:id', vendorController.deleteBankAccount);
router.put('/bank-accounts/:id/primary', vendorController.setPrimaryBankAccount);

module.exports = router;