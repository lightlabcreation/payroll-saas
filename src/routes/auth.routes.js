const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateRegister, validateLogin, validateRefreshToken } = require('../validations/auth.validation');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', validateRegister, authController.register); // Enabled public registration
router.post('/login', validateLogin, authController.login);
router.post('/admin/login', validateLogin, authController.adminLogin);
router.post('/refresh-token', validateRefreshToken, authController.refreshToken);
router.post('/forgot-password', authController.sendOTP);
router.post('/forgot-password/send-otp', authController.sendOTP);
router.post('/forgot-password/verify-reset', authController.verifyReset);
router.get('/verify-setup-token', authController.verifySetupToken);
router.post('/setup-password', authController.setupPassword);

// Protected route
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;

