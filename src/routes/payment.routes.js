const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Public Payment & Checkout Endpoints
router.post('/razorpay/create-order', paymentController.createRazorpayOrder);
router.post('/razorpay/verify-and-register', paymentController.verifyAndRegister);
router.post('/razorpay/webhook', paymentController.handleRazorpayWebhook);
router.post('/create-qr', paymentController.createUPIInvoiceQR);

// Authenticated Payment Endpoints
router.post('/razorpay/verify-payment', authenticate, paymentController.verifyRazorpayPayment);
router.post('/confirm-static', authenticate, paymentController.confirmStaticPayment);

module.exports = router;
