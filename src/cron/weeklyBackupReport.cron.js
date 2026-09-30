const cron = require('node-cron');
const reportService = require('../services/report.service');

/**
 * Automated 7-Day Data & Backup Report Cron Scheduler
 * Runs daily at 06:00 AM (0 6 * * *)
 * Automatically checks 7-day interval and idempotency to prevent duplicate reports.
 */
const startWeeklyBackupReportScheduler = () => {
  console.log('[CRON] Automated 7-Day Data & Backup Report Scheduler Initialized (Every 7 Days)');

  // Run initial table check
  reportService.ensureReportTable().catch(err => console.error('[CRON Report Table Init Error]:', err.message));

  // Schedule daily evaluation at 6:00 AM
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Evaluating 7-Day Automated Data & Backup Report schedule...');
    try {
      const result = await reportService.send7DayReport({
        force: false,
        initiatedBy: 'AUTOMATED_WEEKLY_CRON'
      });

      if (result.skipped) {
        console.log(`[CRON] 7-Day report skipped: ${result.message}`);
      } else if (result.success) {
        console.log(`✅ [CRON] 7-Day report successfully dispatched to ${result.recipientEmail}`);
      } else {
        console.warn(`⚠️ [CRON] 7-Day report dispatch failure: ${result.message}`);
      }
    } catch (err) {
      console.error('[CRON] Error during 7-day automated report execution:', err);
    }
  });
};

module.exports = startWeeklyBackupReportScheduler;
