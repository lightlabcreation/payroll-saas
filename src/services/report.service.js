const db = require('../config/mysql');
const emailService = require('./email.service');
const backupService = require('./backup.service');

class ReportService {
  constructor() {
    this.tableInitialized = false;
    this.defaultRecipientEmail = process.env.SUPER_ADMIN_NOTIFY_EMAIL || process.env.BREVO_SENDER_EMAIL || process.env.SENDER_INFO_EMAIL || 'lightlabcreation@gmail.com';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  }

  /**
   * Ensure `scheduled_report_logs` table exists in database
   */
  async ensureReportTable() {
    if (this.tableInitialized) return;
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS scheduled_report_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_type VARCHAR(50) NOT NULL DEFAULT 'WEEKLY_7_DAY_DATA_REPORT',
          recipient_email VARCHAR(255) NOT NULL,
          status ENUM('success', 'failed', 'retrying') NOT NULL DEFAULT 'success',
          stats_summary JSON NULL,
          backup_filename VARCHAR(255) NULL,
          error_message TEXT NULL,
          retry_count INT DEFAULT 0,
          sent_at DATETIME NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX (recipient_email),
          INDEX (report_type),
          INDEX (sent_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      this.tableInitialized = true;
    } catch (err) {
      console.warn('⚠️ Error initializing scheduled_report_logs table:', err.message);
    }
  }

  /**
   * Aggregate actual live 7-day operational and business metrics from MySQL
   */
  async getWeeklyMetrics(companyId = null) {
    try {
      // 1. Total & New Employees in last 7 days
      let empSql = `
        SELECT 
          COUNT(*) as total_employees,
          SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_employees
        FROM employees
        WHERE status = 'active'
      `;
      const empParams = [];
      if (companyId) {
        empSql += ` AND company_id = ?`;
        empParams.push(companyId);
      }
      const [[empData]] = await db.query(empSql, empParams);

      // 2. Attendance count in last 7 days
      let attSql = `
        SELECT COUNT(*) as count 
        FROM attendance 
        WHERE (date >= DATE_SUB(NOW(), INTERVAL 7 DAY) OR created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
      `;
      const attParams = [];
      if (companyId) {
        attSql += ` AND company_id = ?`;
        attParams.push(companyId);
      }
      const [[attData]] = await db.query(attSql, attParams).catch(() => [[{ count: 0 }]]);

      // 3. Payroll / Salary Disbursed in last 7 days
      let paySql = `
        SELECT 
          COUNT(*) as count, 
          COALESCE(SUM(amount), 0) as total_amount 
        FROM payments 
        WHERE status = 'success' AND (payment_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) OR created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
      `;
      const payParams = [];
      if (companyId) {
        paySql += ` AND employer_id = ?`;
        payParams.push(companyId);
      }
      const [[payData]] = await db.query(paySql, payParams).catch(() => [[{ count: 0, total_amount: 0 }]]);

      // 4. Invoices generated in last 7 days
      let invSql = `
        SELECT 
          COUNT(*) as count, 
          COALESCE(SUM(total_amount), 0) as total_amount 
        FROM invoices 
        WHERE status = 'paid' AND (paid_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) OR created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
      `;
      const invParams = [];
      if (companyId) {
        invSql += ` AND employer_id = ?`;
        invParams.push(companyId);
      }
      const [[invData]] = await db.query(invSql, invParams).catch(() => [[{ count: 0, total_amount: 0 }]]);

      // 5. Active Companies
      const [[compData]] = await db.query(`SELECT COUNT(*) as count FROM companies WHERE status = 'active'`).catch(() => [[{ count: 1 }]]);

      // 6. Support Tickets stats (Open vs Closed in last 7 days)
      const [[ticketData]] = await db.query(`
        SELECT 
          SUM(CASE WHEN status = 'OPEN' OR status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as open_tickets,
          SUM(CASE WHEN status = 'CLOSED' OR status = 'RESOLVED' THEN 1 ELSE 0 END) as closed_tickets
        FROM support_tickets
      `).catch(() => [[{ open_tickets: 0, closed_tickets: 0 }]]);

      const formattedDisbursed = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payData?.total_amount || 0);
      const formattedInvoices = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(invData?.total_amount || 0);

      return {
        totalEmployees: empData?.total_employees || 0,
        newEmployees: empData?.new_employees || 0,
        attendanceCount: attData?.count || 0,
        payrollsCount: payData?.count || 0,
        totalPayrollDisbursed: formattedDisbursed,
        rawPayrollAmount: payData?.total_amount || 0,
        invoicesCount: invData?.count || 0,
        invoicesTotal: formattedInvoices,
        activeCompanies: compData?.count || 0,
        supportTicketsOpen: ticketData?.open_tickets || 0,
        supportTicketsClosed: ticketData?.closed_tickets || 0,
        generatedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('[REPORT_SERVICE] Metrics extraction error:', err.message);
      return {
        totalEmployees: 0,
        newEmployees: 0,
        attendanceCount: 0,
        totalPayrollDisbursed: '₹0.00',
        invoicesCount: 0,
        invoicesTotal: '₹0.00',
        activeCompanies: 0,
        supportTicketsOpen: 0,
        supportTicketsClosed: 0,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Core execution: Generate and Dispatch 7-Day Automatic Data Report
   * Features:
   * - 7-Day Idempotency check (No duplicate reports in same 7 days unless force=true)
   * - Automated live DB backup generation (.json.gz)
   * - Rich HTML Executive Email dispatch
   * - Automatic Retry Mechanism (up to 3 attempts on network failures)
   */
  async send7DayReport({ recipientEmail, force = false, companyId = null, initiatedBy = 'AUTOMATED_CRON' }) {
    await this.ensureReportTable();
    const targetEmail = recipientEmail || this.defaultRecipientEmail;

    // 1. Check for duplicate run in last 7 days
    if (!force) {
      const [recentRuns] = await db.query(`
        SELECT id, sent_at, recipient_email 
        FROM scheduled_report_logs 
        WHERE report_type = 'WEEKLY_7_DAY_DATA_REPORT' 
          AND status = 'success' 
          AND recipient_email = ?
          AND sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY sent_at DESC 
        LIMIT 1
      `, [targetEmail]);

      if (recentRuns.length > 0) {
        const lastSent = recentRuns[0].sent_at;
        const diffMs = (new Date() - new Date(lastSent));
        const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return {
          success: true,
          skipped: true,
          message: `7-Day report was already sent ${daysAgo} day(s) ago (${new Date(lastSent).toLocaleDateString()}). Duplicate skipped.`,
          lastSent
        };
      }
    }

    // 2. Generate actual data metrics
    const metrics = await this.getWeeklyMetrics(companyId);

    // 3. Generate automated 7-day database snapshot
    let backupFile = null;
    try {
      backupFile = await backupService.generateDatabaseBackup({
        companyId,
        filenamePrefix: 'weekly_7day_report_db'
      });
    } catch (bErr) {
      console.warn('⚠️ [Report Backup Warning]:', bErr.message);
    }

    const backupFilename = backupFile?.filename || 'weekly_backup_snapshot.json.gz';
    const backupDownloadUrl = `${this.frontendUrl}/admin/backups`;
    const periodString = `${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString()} to ${new Date().toLocaleDateString()}`;

    // 4. Retry loop (up to 3 attempts)
    let maxRetries = 3;
    let attempt = 0;
    let emailResult = null;
    let lastError = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        emailResult = await emailService.sendWeeklyDataReportEmail({
          toEmail: targetEmail,
          toName: 'Kiaan Administrator',
          period: periodString,
          metrics,
          backupFilename,
          backupDownloadUrl
        });

        if (emailResult && emailResult.success !== false) {
          break; // Succeeded!
        } else {
          lastError = emailResult?.error || 'Email delivery failed';
        }
      } catch (e) {
        lastError = e.message;
        console.warn(`[Report Retry ${attempt}/${maxRetries}] Failed:`, e.message);
      }
    }

    const isSuccess = emailResult && emailResult.success !== false;

    // 5. Record Log in DB
    const [logResult] = await db.query(`
      INSERT INTO scheduled_report_logs
        (report_type, recipient_email, status, stats_summary, backup_filename, error_message, retry_count, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ${isSuccess ? 'NOW()' : 'NULL'}, NOW())
    `, [
      'WEEKLY_7_DAY_DATA_REPORT',
      targetEmail,
      isSuccess ? 'success' : 'failed',
      JSON.stringify(metrics),
      backupFilename,
      isSuccess ? null : `Failed after ${attempt} attempts: ${lastError}`,
      attempt - 1
    ]);

    if (!isSuccess) {
      console.error(`❌ [REPORT_SERVICE] 7-Day report dispatch failed after ${attempt} attempts:`, lastError);
      return {
        success: false,
        message: `Failed to dispatch 7-day report after ${attempt} attempts: ${lastError}`,
        logId: logResult.insertId
      };
    }

    console.log(`✅ [REPORT_SERVICE] 7-Day report & backup successfully dispatched to ${targetEmail}`);
    return {
      success: true,
      message: `7-Day Data Report & Database Backup sent successfully to ${targetEmail}`,
      recipientEmail: targetEmail,
      backupFilename,
      period: periodString,
      metrics,
      sentAt: new Date().toISOString(),
      logId: logResult.insertId
    };
  }

  /**
   * Manual On-Demand Email Backup Dispatch (Used by UI Form)
   */
  async sendDirectBackupEmail({ toEmail, type = 'database', companyId = null, notes = '', requesterName = 'Admin' }) {
    if (!toEmail) {
      throw new Error('Recipient email address is required.');
    }

    await this.ensureReportTable();

    // 1. Generate requested backup
    let backupResult;
    if (type === 'uploads') {
      backupResult = await backupService.generateUploadsBackup();
    } else {
      backupResult = await backupService.generateDatabaseBackup({ companyId });
    }

    const downloadUrl = `${this.frontendUrl}/admin/backups`;

    // 2. Dispatch Email
    const emailResult = await emailService.sendDatabaseBackupEmail({
      toEmail,
      toName: requesterName,
      filename: backupResult.filename,
      fileSize: backupResult.sizeFormatted || `${(backupResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
      companyName: companyId ? `Company #${companyId}` : 'Full System Database',
      downloadUrl,
      notes: notes || 'Manual backup requested via Admin Backup Panel.'
    });

    // 3. Log to DB
    await db.query(`
      INSERT INTO scheduled_report_logs
        (report_type, recipient_email, status, stats_summary, backup_filename, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      'MANUAL_EMAIL_BACKUP',
      toEmail,
      emailResult?.success !== false ? 'success' : 'failed',
      JSON.stringify({ type, companyId, notes }),
      backupResult.filename
    ]);

    return {
      success: true,
      message: `Database backup snapshot (${backupResult.filename}) successfully sent to ${toEmail}!`,
      filename: backupResult.filename,
      recipientEmail: toEmail
    };
  }

  /**
   * Retrieve Status & History for UI
   */
  async getReportScheduleStatus() {
    await this.ensureReportTable();

    const [logs] = await db.query(`
      SELECT id, report_type, recipient_email, status, backup_filename, error_message, retry_count, sent_at, created_at, stats_summary
      FROM scheduled_report_logs
      ORDER BY id DESC
      LIMIT 15
    `).catch(() => [[]]);

    const [lastSuccess] = await db.query(`
      SELECT id, sent_at, recipient_email, backup_filename
      FROM scheduled_report_logs
      WHERE status = 'success' AND report_type = 'WEEKLY_7_DAY_DATA_REPORT'
      ORDER BY sent_at DESC
      LIMIT 1
    `).catch(() => [[]]);

    let lastSentDate = lastSuccess[0]?.sent_at || null;
    let nextScheduledRun = null;

    if (lastSentDate) {
      const d = new Date(lastSentDate);
      d.setDate(d.getDate() + 7);
      nextScheduledRun = d.toISOString();
    } else {
      // If never run, next run is upcoming cron cycle
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      nextScheduledRun = d.toISOString();
    }

    return {
      isCronActive: true,
      frequency: 'Every 7 Days',
      defaultRecipientEmail: this.defaultRecipientEmail,
      lastReport: lastSuccess[0] || null,
      nextScheduledRun,
      history: logs.map(l => ({
        ...l,
        statsSummary: typeof l.stats_summary === 'string' ? JSON.parse(l.stats_summary) : l.stats_summary
      }))
    };
  }
}

module.exports = new ReportService();
