const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const backupController = require('../controllers/backup.controller');
const backupService = require('../services/backup.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Configure Multer storage for backup upload and recovery
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, backupService.BACKUP_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `uploaded_restore_${baseName}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // Max 500 MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.json.gz') || file.originalname.endsWith('.json') || file.originalname.endsWith('.sql')) {
      cb(null, true);
    } else {
      cb(new Error('Only .json.gz, .json, and .sql backup archives are supported.'), false);
    }
  }
});

// Protect all backup routes for SuperAdmin
router.use(authenticate);
router.use(authorize('superadmin'));

// Endpoints
router.get('/', backupController.getBackups);
router.post('/create', backupController.createBackup);
router.get('/download/:filename', backupController.downloadBackup);
router.delete('/:filename', backupController.deleteBackup);
router.post('/restore', backupController.restoreBackup);
router.post('/upload-restore', upload.single('backupFile'), backupController.uploadAndRestore);

module.exports = router;
