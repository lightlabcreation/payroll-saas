const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// All routes are protected
router.use(authenticate);

// Get Profile
router.get('/', profileController.getProfile);

// Update Profile
router.put('/update', profileController.updateProfile);

// Change Password
router.put('/change-password', profileController.changePassword);

module.exports = router;
