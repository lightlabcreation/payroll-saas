const express = require('express');
const router = express.Router();
const userRequestsController = require('../controllers/userRequests.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Public route to submit a request
router.post('/', userRequestsController.createRequest);

// Protected routes for Super Admin to manage requests
router.get('/', authenticate, authorize('superadmin'), userRequestsController.getAllRequests);
router.delete('/:id', authenticate, authorize('superadmin'), userRequestsController.deleteRequest);

module.exports = router;
