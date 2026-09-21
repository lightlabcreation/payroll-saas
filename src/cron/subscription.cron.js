const cron = require('node-cron');
const db = require('../config/mysql');
const emailService = require('../services/email.service');

/**
 * Enterprise Production Subscription Expiry & Automated Reminder Scheduler
 * Runs every hour (0 * * * *)
 * Prevents duplicate emails using `subscription_reminders` database table
 */
const startSubscriptionScheduler = () => {
  console.log('[CRON] Automated Subscription Expiry & Multi-Interval Reminder Scheduler Initialized');

  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running hourly subscription expiry & reminder check...');
    const connection = await db.getConnection();

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      // ==========================================
      // 1. Check Upcoming Expiry Reminders (7d, 3d, 1d)
      // ==========================================
      const intervals = [
        { days: 7, type: '7_day' },
        { days: 3, type: '3_day' },
        { days: 1, type: '1_day' }
      ];

      for (const interval of intervals) {
        const [upcomingSubs] = await connection.query(`
          SELECT s.id as subscription_id, s.employer_id, s.end_date, p.name as plan_name,
                 e.company_name, u.email as admin_email, u.name as admin_name,
                 DATEDIFF(s.end_date, NOW()) as days_remaining
          FROM subscriptions s
          JOIN employers e ON s.employer_id = e.id
          JOIN users u ON e.user_id = u.id
          JOIN plans p ON s.plan_id = p.id
          WHERE s.status = 'active' 
            AND DATEDIFF(s.end_date, NOW()) = ?
            AND s.id NOT IN (
              SELECT subscription_id FROM subscription_reminders WHERE reminder_type = ?
            )
        `, [interval.days, interval.type]);

        if (upcomingSubs.length > 0) {
          console.log(`[CRON] Found ${upcomingSubs.length} subscriptions expiring in ${interval.days} days.`);

          for (const sub of upcomingSubs) {
            const formattedDate = new Date(sub.end_date).toLocaleDateString();

            // A. Send HR Admin Expiry Reminder Email
            await emailService.sendHRAdminUpcomingExpiryReminder({
              email: sub.admin_email,
              name: sub.admin_name,
              companyName: sub.company_name,
              planName: sub.plan_name,
              expiryDate: formattedDate,
              daysRemaining: sub.days_remaining,
              renewUrl: `${frontendUrl}/admin/billing`
            }).catch(err => console.error(`[CRON Error]: ${err.message}`));

            // B. Send Super Admin Upcoming Expiry Alert to info@kiaantechnology.com
            await emailService.sendSuperAdminUpcomingExpiryNotification({
              companyName: sub.company_name,
              adminName: sub.admin_name,
              planName: sub.plan_name,
              expiryDate: formattedDate,
              daysRemaining: sub.days_remaining,
              renewalStatus: 'Pending Customer Action'
            }).catch(err => console.error(`[CRON Error]: ${err.message}`));

            // C. Record reminder in DB to enforce Idempotency & avoid duplicate dispatches
            await connection.query(`
              INSERT INTO subscription_reminders 
                (subscription_id, employer_id, reminder_type, sent_to_email, sent_at)
              VALUES (?, ?, ?, ?, NOW())
              ON DUPLICATE KEY UPDATE sent_at = NOW()
            `, [sub.subscription_id, sub.employer_id, interval.type, sub.admin_email]);

            console.log(`✅ [CRON] Dispatched ${interval.type} expiry reminder to ${sub.admin_email} for ${sub.company_name}`);
          }
        }
      }

      // ==========================================
      // 2. Identify Expired Subscriptions & Send Suspension/Expiry Alerts
      // ==========================================
      const [expiredSubs] = await connection.query(`
        SELECT s.id as subscription_id, s.employer_id, s.end_date, p.name as plan_name,
               e.company_name, u.email as admin_email, u.name as admin_name
        FROM subscriptions s
        JOIN employers e ON s.employer_id = e.id
        JOIN users u ON e.user_id = u.id
        JOIN plans p ON s.plan_id = p.id
        WHERE s.status = 'active' AND (s.end_date <= NOW())
      `);

      if (expiredSubs.length > 0) {
        console.log(`[CRON] Found ${expiredSubs.length} newly expired subscriptions.`);

        for (const sub of expiredSubs) {
          const formattedDate = new Date(sub.end_date).toLocaleDateString();

          // Flip subscription status to 'expired'
          await connection.query(
            "UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE id = ?",
            [sub.subscription_id]
          );

          // Update tenant/employer status
          await connection.query(
            "UPDATE employers SET status = 'inactive', subscription_status = 'expired', updated_at = NOW() WHERE id = ?",
            [sub.employer_id]
          );

          // Dispatch Subscription Expired Email to HR Admin
          await emailService.sendHRAdminSubscriptionExpiredEmail({
            email: sub.admin_email,
            name: sub.admin_name,
            companyName: sub.company_name,
            planName: sub.plan_name,
            expiryDate: formattedDate,
            renewUrl: `${frontendUrl}/admin/billing`
          }).catch(err => console.error(`[CRON Error]: ${err.message}`));

          // Dispatch Super Admin Expiry Alert to info@kiaantechnology.com
          await emailService.sendSuperAdminSubscriptionExpiredNotification({
            companyName: sub.company_name,
            adminName: sub.admin_name,
            planName: sub.plan_name,
            expiryDate: formattedDate,
            currentStatus: 'Expired / Restricted',
            renewalStatus: 'Renewal Required'
          }).catch(err => console.error(`[CRON Error]: ${err.message}`));

          // Record in subscription_reminders
          await connection.query(`
            INSERT INTO subscription_reminders 
              (subscription_id, employer_id, reminder_type, sent_to_email, sent_at)
            VALUES (?, ?, 'expired', ?, NOW())
            ON DUPLICATE KEY UPDATE sent_at = NOW()
          `, [sub.subscription_id, sub.employer_id, sub.admin_email]);

          console.log(`🔴 [CRON] Expired subscription processed for ${sub.company_name}`);
        }
      } else {
        console.log('[CRON] No newly expired subscriptions in this cycle.');
      }
    } catch (error) {
      console.error('[CRON] Error during subscription expiry check:', error);
    } finally {
      connection.release();
    }
  });
};

module.exports = startSubscriptionScheduler;
