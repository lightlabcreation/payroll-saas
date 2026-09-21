const express = require('express');
const router = express.Router();
const creditController = require('../controllers/credit.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

/**
 * ==================== ADMIN ROUTES ====================
 */

// All admin credit routes require authentication and admin role
router.use(authenticate);

/**
 * POST /admin/credits/add
 * Add credit to single employer
 */
router.post(
  '/add',
  authorize('admin', 'superadmin'),
  creditController.addCreditSingle
);

/**
 * POST /admin/credits/bulk-add
 * Bulk add credit to multiple employers
 */
router.post(
  '/bulk-add',
  authorize('admin', 'superadmin'),
  creditController.addCreditBulk
);

/**
 * GET /admin/credits/stats
 * Get credit statistics
 */
router.get(
  '/stats',
  authorize('admin', 'superadmin'),
  creditController.getCreditStats
);

/**
 * GET /admin/credits
 * Get credit history with filters
 */
router.get(
  '/',
  authorize('admin', 'superadmin'),
  creditController.getAdminCreditHistory
);

/**
 * GET /admin/credits/:id
 * Get credit by ID
 */
router.get(
  '/:id',
  authorize('admin', 'superadmin'),
  creditController.getCreditById
);

/**
 * PUT /admin/credits/:id
 * Update credit
 */
router.put(
  '/:id',
  authorize('admin', 'superadmin'),
  creditController.updateCredit
);

/**
 * ==================== EMPLOYER ROUTES ====================
 */

/**
 * GET /employer/wallet
 * Get employer wallet balance
 */
router.get(
  '/employer/wallet',
  authenticate,
  creditController.getEmployerWallet
);

/**
 * GET /employer/credits
 * Get employer credit history
 */
router.get(
  '/employer/credits',
  authenticate,
  creditController.getEmployerCreditHistory
);

module.exports = router;
