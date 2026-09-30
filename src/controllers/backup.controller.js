const fs = require('fs');
const path = require('path');
const backupService = require('../services/backup.service');

/**
 * GET /api/superadmin/backups
 * Retrieve all available system backups
 */
const getBackups = async (req, res) => {
  try {
    const backups = await backupService.listBackups();
    return res.status(200).json({
      success: true,
      count: backups.length,
      data: backups
    });
  } catch (error) {
    console.error('[Backup Controller Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/superadmin/backups/create
 * Create a new database or files backup snapshot
 */
const createBackup = async (req, res) => {
  try {
    const { type = 'database', companyId = null, tenantId = null } = req.body;
    const targetCompanyId = companyId || tenantId;

    let result;
    if (type === 'uploads') {
      result = await backupService.generateUploadsBackup();
    } else {
      result = await backupService.generateDatabaseBackup({ companyId: targetCompanyId });
    }

    return res.status(201).json({
      success: true,
      message: `${type === 'uploads' ? 'Files archive' : 'Database snapshot'} created successfully.`,
      data: result
    });
  } catch (error) {
    console.error('[Backup Controller Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/superadmin/backups/download/:filename
 * Securely stream and download a backup archive
 */
const downloadBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(backupService.BACKUP_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Backup file not found.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('[Backup Download Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/superadmin/backups/:filename
 * Delete a specific backup file
 */
const deleteBackup = async (req, res) => {
  try {
    const { filename } = req.params;
    const result = await backupService.deleteBackup(filename);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Backup Delete Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/superadmin/backups/restore
 * Trigger database restore from an existing backup file on server
 */
const restoreBackup = async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Filename is required for restoration.' });
    }

    const result = await backupService.restoreDatabase(filename, {
      userId: req.user?.id,
      email: req.user?.email
    });

    return res.status(200).json({
      success: true,
      message: 'Database snapshot successfully restored.',
      data: result
    });
  } catch (error) {
    console.error('[Backup Restore Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/superadmin/backups/upload-restore
 * Upload a .json.gz or .json backup file and immediately restore it
 */
const uploadAndRestore = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No backup file uploaded.' });
    }

    const uploadedFilename = req.file.filename;
    const result = await backupService.restoreDatabase(uploadedFilename, {
      userId: req.user?.id,
      email: req.user?.email
    });

    return res.status(200).json({
      success: true,
      message: 'Uploaded backup file restored successfully.',
      data: result
    });
  } catch (error) {
    console.error('[Upload & Restore Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getBackups,
  createBackup,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  uploadAndRestore
};
