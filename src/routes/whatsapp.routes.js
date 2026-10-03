const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication and Admin/Employer/Superadmin roles
router.use(authenticate);
router.use(authorize('superadmin', 'admin', 'employer'));

router.get('/status', whatsappController.getStatus);
router.post('/connect', whatsappController.connect);
router.post('/pairing-code', whatsappController.getPairingCode);
router.post('/disconnect', whatsappController.disconnect);
router.put('/preferences', whatsappController.updatePreferences);
router.post('/test', whatsappController.sendTestMessage);
router.get('/logs', whatsappController.getLogs);

module.exports = router;
