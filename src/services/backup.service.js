/**
 * Universal SaaS Backup & Recovery Service
 * Compatible with MySQL2 Connection Pool & Express Architecture
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let archiver;
try {
  archiver = require('archiver');
} catch (err) {
  console.warn('[Backup Service] archiver module not loaded:', err.message);
}
const pool = require('../config/mysql');

// Storage directory for backups
const BACKUP_DIR = path.resolve(__dirname, '../../backups');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure directories exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Helper: Format bytes to human-readable size
 */
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Helper: Format values safely for SQL insert
 */
const formatSqlValue = (val) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 'NULL';
  if (val instanceof Date) {
    const iso = val.toISOString().slice(0, 19).replace('T', ' ');
    return `'${iso}'`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  const str = String(val);
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
};

/**
 * 1. Generate Full or Company-Scoped Database Backup Snapshot (.json.gz)
 */
const generateDatabaseBackup = async (options = {}) => {
  const { companyId = null, filenamePrefix = 'db_backup' } = options;

  let company = null;
  if (companyId) {
    try {
      const [rows] = await pool.query('SELECT id, name FROM companies WHERE id = ?', [companyId]);
      if (rows.length > 0) company = rows[0];
    } catch (e) {
      console.warn('[Backup Engine] Error fetching company info:', e.message);
    }
  }

  const companySlug = company?.name 
    ? company.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-') 
    : (companyId ? String(companyId) : '');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${filenamePrefix}_${companyId ? `company_${companySlug}_` : 'full_'}${timestamp}.json.gz`;
  const targetPath = path.join(BACKUP_DIR, filename);

  try {
    // 1. Fetch all tables from current MySQL database
    const [rawTables] = await pool.query(`
      SELECT TABLE_NAME as tableName 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_TYPE = 'BASE TABLE'
    `);

    const tableNames = rawTables.map(t => t.tableName || t.TABLE_NAME);
    const backupData = {
      manifest: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        isFullSystem: !companyId,
        targetCompanyId: companyId,
        companyName: company?.name || null,
        companySlug: companySlug || null,
        tablesCount: tableNames.length,
        recordCounts: {}
      },
      tables: {}
    };

    // 2. Dump data table-by-table dynamically
    for (const tableName of tableNames) {
      try {
        let rows = [];
        if (companyId) {
          // Check if table contains company_id or companyId column
          const [columns] = await pool.query(`
            SELECT COLUMN_NAME as columnName 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = ? 
              AND (COLUMN_NAME = 'company_id' OR COLUMN_NAME = 'companyId');
          `, [tableName]);

          if (columns.length > 0) {
            const colName = columns[0].columnName;
            const [data] = await pool.query(`SELECT * FROM \`${tableName}\` WHERE \`${colName}\` = ?`, [companyId]);
            rows = data;
          } else if (tableName === 'companies') {
            const [data] = await pool.query(`SELECT * FROM \`companies\` WHERE \`id\` = ?`, [companyId]);
            rows = data;
          } else {
            // Non-company table; skip for company-scoped backup
            continue;
          }
        } else {
          // Full system dump
          const [data] = await pool.query(`SELECT * FROM \`${tableName}\``);
          rows = data;
        }

        backupData.tables[tableName] = rows;
        backupData.manifest.recordCounts[tableName] = rows.length;
      } catch (tableErr) {
        console.warn(`[Backup Engine] Warning on table ${tableName}:`, tableErr.message);
      }
    }

    // 3. Compress JSON into .json.gz safely with BigInt handling
    const jsonString = JSON.stringify(backupData, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    const compressedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
    fs.writeFileSync(targetPath, compressedBuffer);

    const stats = fs.statSync(targetPath);

    return {
      success: true,
      filename,
      filePath: targetPath,
      sizeBytes: stats.size,
      sizeFormatted: formatBytes(stats.size),
      tablesBackedUp: Object.keys(backupData.tables).length,
      manifest: backupData.manifest
    };
  } catch (error) {
    console.error('[Backup Engine Error]:', error);
    throw new Error(`Database backup failed: ${error.message}`);
  }
};

/**
 * 2. Generate Uploads / Storage Zip Archive
 */
const generateUploadsBackup = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `uploads_backup_${timestamp}.zip`;
  const targetPath = path.join(BACKUP_DIR, filename);

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    if (!archiver) {
      return reject(new Error('Archiver module is not available. Please install archiver.'));
    }
    const output = fs.createWriteStream(targetPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const stats = fs.statSync(targetPath);
      resolve({
        success: true,
        filename,
        filePath: targetPath,
        sizeBytes: stats.size,
        sizeFormatted: formatBytes(stats.size),
        type: 'uploads'
      });
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(UPLOADS_DIR, false);
    archive.finalize();
  });
};

/**
 * 3. List All Available Backups with Metadata
 */
const listBackups = async () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BACKUP_DIR);
  const backupList = [];

  for (const file of files) {
    if (file.endsWith('.json.gz') || file.endsWith('.zip') || file.endsWith('.sql') || file.endsWith('.json')) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      let type = 'database';
      let scope = 'full';
      let scopeLabel = 'Full Platform';
      let companyName = null;

      if (file.startsWith('uploads_backup') || file.endsWith('.zip')) {
        type = 'uploads';
        scopeLabel = 'File Attachments';
      } else if (file.includes('company_')) {
        const parts = file.split('company_')[1]?.split('_');
        const slug = parts ? parts[0] : 'company';
        scope = 'company';
        companyName = slug.replace(/-/g, ' ').toUpperCase();
        scopeLabel = `Company: ${companyName}`;
      }

      backupList.push({
        filename: file,
        filePath,
        type,
        scope,
        scopeLabel,
        companyName,
        sizeBytes: stats.size,
        sizeFormatted: formatBytes(stats.size),
        createdAt: stats.birthtime || stats.mtime,
        ageInDays: Math.floor((Date.now() - new Date(stats.mtime).getTime()) / (1000 * 60 * 60 * 24))
      });
    }
  }

  // Sort latest first
  return backupList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * 4. Delete a Backup File
 */
const deleteBackup = async (filename) => {
  const safeFilename = path.basename(filename);
  const targetPath = path.join(BACKUP_DIR, safeFilename);

  if (!fs.existsSync(targetPath)) {
    throw new Error('Backup file does not exist.');
  }

  fs.unlinkSync(targetPath);
  return { success: true, message: `Backup file ${safeFilename} deleted successfully.` };
};

/**
 * 5. Restore Database from a .json.gz or .json Backup File
 */
const restoreDatabase = async (filename, actorInfo = {}) => {
  const safeFilename = path.basename(filename);
  const targetPath = path.join(BACKUP_DIR, safeFilename);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Backup file '${safeFilename}' does not exist on server.`);
  }

  try {
    const fileBuffer = fs.readFileSync(targetPath);
    let jsonString;

    if (safeFilename.endsWith('.gz')) {
      jsonString = zlib.gunzipSync(fileBuffer).toString('utf-8');
    } else {
      jsonString = fileBuffer.toString('utf-8');
    }

    const backupData = JSON.parse(jsonString);

    if (!backupData.tables || !backupData.manifest) {
      throw new Error('Invalid backup archive structure: missing tables or manifest.');
    }

    // Disable foreign key checks for atomic and safe restoration
    await pool.query('SET FOREIGN_KEY_CHECKS = 0;');

    const restoredStats = {};

    for (const [tableName, rows] of Object.entries(backupData.tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      try {
        let insertedCount = 0;
        const CHUNK_SIZE = 100;

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const columns = Object.keys(chunk[0]);
          const escapedColumns = columns.map(c => `\`${c}\``).join(', ');

          const valueTuples = chunk.map(row => {
            const formattedValues = columns.map(col => formatSqlValue(row[col]));
            return `(${formattedValues.join(', ')})`;
          });

          // Use REPLACE INTO for idempotent restoration
          const sql = `REPLACE INTO \`${tableName}\` (${escapedColumns}) VALUES ${valueTuples.join(', ')};`;
          await pool.query(sql);
          insertedCount += chunk.length;
        }

        restoredStats[tableName] = insertedCount;
      } catch (err) {
        console.warn(`[Restore Warning] Error restoring table ${tableName}:`, err.message);
      }
    }

    // Re-enable foreign key checks
    await pool.query('SET FOREIGN_KEY_CHECKS = 1;');

    return {
      success: true,
      message: 'Database restoration completed successfully.',
      filename: safeFilename,
      manifest: backupData.manifest,
      restoredTablesCount: Object.keys(restoredStats).length,
      restoredStats
    };
  } catch (error) {
    // Ensure foreign key checks are re-enabled in case of error
    try {
      await pool.query('SET FOREIGN_KEY_CHECKS = 1;');
    } catch (_) {}
    console.error('[Restore Engine Error]:', error);
    throw new Error(`Restoration failed: ${error.message}`);
  }
};

module.exports = {
  BACKUP_DIR,
  UPLOADS_DIR,
  generateDatabaseBackup,
  generateUploadsBackup,
  listBackups,
  deleteBackup,
  restoreDatabase
};
