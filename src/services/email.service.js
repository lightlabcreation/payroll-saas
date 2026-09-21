const https = require('https');
const { URL } = require('url');
const db = require('../config/mysql');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const emailTemplates = require('./email.templates');

/**
 * Kiaan Technology - Enterprise Production Email & Notification Service
 * Supports Brevo REST API v3 with dual sender routing:
 * - Business & System Alerts: info@kiaantechnology.com
 * - Support Ticket Alerts: support@kiaantechnology.com
 */
class EmailService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.replace(/["']/g, '').trim() : '';
    this.senderName = process.env.BREVO_SENDER_NAME || 'Kiaan Technology Pvt Ltd';
    
    // Official Senders & Routing Targets
    this.infoEmail = process.env.SENDER_INFO_EMAIL || process.env.SUPER_ADMIN_NOTIFY_EMAIL || 'info@kiaantechnology.com';
    this.supportEmail = process.env.SENDER_SUPPORT_EMAIL || process.env.SUPPORT_NOTIFICATION_EMAIL || process.env.SUPPORT_NOTIFY_EMAIL || 'support@kiaantechnology.com';
    this.superAdminNotifyEmail = process.env.SUPER_ADMIN_NOTIFY_EMAIL || 'info@kiaantechnology.com';
    this.supportNotifyEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || process.env.SUPPORT_NOTIFY_EMAIL || 'support@kiaantechnology.com';
    
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    this.apiUrl = 'https://api.brevo.com/v3/smtp/email';
  }

  /**
   * Log Email Attempt into database table `email_logs`
   */
  async logEmailAttempt({
    notificationType,
    recipientEmail,
    senderEmail,
    companyId = null,
    userId = null,
    ticketId = null,
    subscriptionId = null,
    transactionId = null,
    subject,
    status = 'pending',
    messageId = null,
    deliveryAttempts = 1,
    errorMessage = null
  }) {
    try {
      const [result] = await db.query(
        `INSERT INTO email_logs 
          (notification_type, recipient_email, sender_email, company_id, user_id, ticket_id, subscription_id, transaction_id, subject, status, message_id, delivery_attempts, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          notificationType,
          recipientEmail,
          senderEmail,
          companyId,
          userId,
          ticketId,
          subscriptionId,
          transactionId,
          subject,
          status,
          messageId,
          deliveryAttempts,
          errorMessage
        ]
      );
      return result.insertId;
    } catch (err) {
      console.error('❌ Failed to log email attempt to DB:', err.message);
      return null;
    }
  }

  /**
   * Core method to send transactional emails via Brevo v3 REST API
   */
  async sendEmail({
    toEmail,
    toName,
    subject,
    htmlContent,
    textContent,
    fromEmail,
    fromName,
    notificationType = 'GENERAL_ALERT',
    contextIds = {}
  }) {
    const senderEmail = fromEmail || this.infoEmail;
    const senderDisplayName = fromName || this.senderName;

    // First log as pending
    const logId = await this.logEmailAttempt({
      notificationType,
      recipientEmail: toEmail,
      senderEmail,
      companyId: contextIds.companyId,
      userId: contextIds.userId,
      ticketId: contextIds.ticketId,
      subscriptionId: contextIds.subscriptionId,
      transactionId: contextIds.transactionId,
      subject,
      status: 'pending'
    });

    if (!this.apiKey) {
      const errorMsg = 'BREVO_API_KEY is not configured in process.env';
      console.warn(`⚠️ ${errorMsg}`);
      if (logId) {
        await db.query(
          `UPDATE email_logs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
          [errorMsg, logId]
        );
      }
      return { success: false, error: errorMsg };
    }

    const payload = JSON.stringify({
      sender: {
        name: senderDisplayName,
        email: senderEmail
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail
        }
      ],
      subject: subject,
      htmlContent: htmlContent,
      ...(textContent && { textContent: textContent })
    });

    const urlObj = new URL(this.apiUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', async () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              const messageId = data.messageId || 'N/A';
              console.log(`✅ Brevo Email sent [${notificationType}] to ${toEmail} [MsgID: ${messageId}]`);
              
              if (logId) {
                await db.query(
                  `UPDATE email_logs SET status = 'accepted', message_id = ?, updated_at = NOW() WHERE id = ?`,
                  [messageId, logId]
                );
              }
              resolve({ success: true, messageId });
            } catch (err) {
              if (logId) {
                await db.query(
                  `UPDATE email_logs SET status = 'accepted', error_message = ?, updated_at = NOW() WHERE id = ?`,
                  ['Parsed response with warning: ' + body, logId]
                );
              }
              resolve({ success: true, raw: body });
            }
          } else {
            console.error(`❌ Brevo API Error [${res.statusCode}] for ${toEmail}: ${body}`);
            
            // Attempt Nodemailer SMTP fallback if available
            const fallbackSent = await this._sendNodemailerFallback({
              toEmail,
              toName,
              subject,
              htmlContent,
              textContent,
              fromEmail,
              fromName,
              logId
            });

            if (fallbackSent) {
              resolve({ success: true, fallback: true });
            } else {
              if (logId) {
                await db.query(
                  `UPDATE email_logs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
                  [`HTTP ${res.statusCode}: ${body}`, logId]
                );
              }
              resolve({ success: false, statusCode: res.statusCode, error: body });
            }
          }
        });
      });

      req.on('error', async (err) => {
        console.error(`❌ Network error sending email to ${toEmail}:`, err.message);
        if (logId) {
          await db.query(
            `UPDATE email_logs SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
            [err.message, logId]
          );
        }
        resolve({ success: false, error: err.message });
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Helper: Send via Nodemailer fallback transport
   */
  async _sendNodemailerFallback({ toEmail, toName, subject, htmlContent, textContent, fromEmail, fromName, logId }) {
    try {
      const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
      const smtpPass = process.env.SMTP_PASSWORD;

      if (!smtpUser || !smtpPass) {
        console.warn('⚠️ SMTP fallback credentials missing in process.env');
        return false;
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: `"${fromName || this.senderName}" <${smtpUser}>`,
        to: `"${toName || toEmail}" <${toEmail}>`,
        subject: subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`✅ Nodemailer fallback email sent successfully to ${toEmail} [MsgID: ${info.messageId}]`);
      if (logId) {
        await db.query(
          `UPDATE email_logs SET status = 'accepted', message_id = ?, updated_at = NOW() WHERE id = ?`,
          [info.messageId, logId]
        );
      }
      return true;
    } catch (err) {
      console.error(`❌ Nodemailer fallback error for ${toEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Helper: Generate HTML Master Layout with Crimson Red (#C62828) Branding
   */
  _buildEmailLayout({ title, content, ctaText, ctaUrl, footerNote }) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0F172A; padding: 24px 32px; border-bottom: 3px solid #C62828;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">KIAAN TECHNOLOGY</h1>
                    <p style="margin: 4px 0 0 0; color: #EF4444; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Payroll & HRMS Multi-Tenant SaaS</p>
                  </td>
                  <td align="right">
                    <span style="background-color: #C62828; color: #FFFFFF; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">Official Alert</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
              ${ctaText && ctaUrl ? `
                <div style="margin: 28px 0; text-align: center;">
                  <a href="${ctaUrl}" style="background-color: #C62828; color: #FFFFFF; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(198,40,40,0.25);">${ctaText}</a>
                </div>
              ` : ''}
              ${footerNote ? `
                <div style="background-color: #F8FAFC; border-left: 4px solid #C62828; padding: 14px 16px; border-radius: 4px; margin-top: 24px;">
                  <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.5;">${footerNote}</p>
                </div>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0 0 6px 0; color: #64748B; font-size: 12px;"><strong>Kiaan Technology Private Limited</strong> | Enterprise SaaS Platform</p>
              <p style="margin: 0 0 8px 0; color: #94A3B8; font-size: 11px;">
                General Enquiries: <a href="mailto:info@kiaantechnology.com" style="color: #C62828; text-decoration: none;">info@kiaantechnology.com</a> | 
                Support Desk: <a href="mailto:support@kiaantechnology.com" style="color: #C62828; text-decoration: none;">support@kiaantechnology.com</a>
              </p>
              <p style="margin: 0; color: #CBD5E1; font-size: 11px;">© 2026 Kiaan Technology Pvt. Ltd. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // ==========================================
  // SECTION 3: SUPER ADMIN NOTIFICATIONS
  // Destination: info@kiaantechnology.com
  // ==========================================

  /**
   * 3.A New HR Admin Registration
   */
  async sendSuperAdminNewRegistrationNotification({ companyName, adminName, email, phone, createdAt, status, planName, activationStatus }) {
    const subject = `New HR Admin Registered – ${companyName || 'Corporate Client'}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 18px;">New HR Admin Account Registered</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        A new corporate company and HR Admin account has been registered on the Kiaan SaaS platform.
      </p>
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #334155;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName || 'N/A'}</td></tr>
          <tr><td><strong>HR Admin Name:</strong></td><td>${adminName || 'N/A'}</td></tr>
          <tr><td><strong>Registered Email:</strong></td><td>${email}</td></tr>
          <tr><td><strong>Phone Number:</strong></td><td>${phone || 'N/A'}</td></tr>
          <tr><td><strong>Registration Date:</strong></td><td>${createdAt || new Date().toLocaleString()}</td></tr>
          <tr><td><strong>Account Status:</strong></td><td><span style="color: #059669; font-weight: bold;">${status || 'active'}</span></td></tr>
          <tr><td><strong>Subscription Plan:</strong></td><td>${planName || 'Free Trial / Selected'}</td></tr>
          <tr><td><strong>Activation Status:</strong></td><td>${activationStatus || 'Pending Activation'}</td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.superAdminNotifyEmail,
      toName: 'Super Admin Team',
      fromEmail: this.infoEmail,
      fromName: 'Kiaan System Router',
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'View Super Admin Dashboard',
        ctaUrl: `${this.frontendUrl}/super-admin`
      }),
      notificationType: 'SUPERADMIN_NEW_REGISTRATION'
    });
  }

  /**
   * 3.B New Subscription Purchase
   */
  async sendSuperAdminSubscriptionPurchaseNotification({ companyName, adminName, email, planName, price, currency = 'INR', startDate, expiryDate, paymentStatus, transactionId, paymentGateway = 'Razorpay', purchaseDate }) {
    const subject = `New Subscription Purchase – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 18px;">Subscription Plan Purchased</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        A new subscription purchase has been recorded for <strong>${companyName}</strong>.
      </p>
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #334155;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName}</td></tr>
          <tr><td><strong>HR Admin Name:</strong></td><td>${adminName} (${email})</td></tr>
          <tr><td><strong>Plan Purchased:</strong></td><td><strong style="color: #C62828;">${planName}</strong></td></tr>
          <tr><td><strong>Plan Price:</strong></td><td>${currency} ${price}</td></tr>
          <tr><td><strong>Subscription Period:</strong></td><td>${startDate} to ${expiryDate}</td></tr>
          <tr><td><strong>Payment Status:</strong></td><td><strong style="color: #059669;">${paymentStatus}</strong></td></tr>
          <tr><td><strong>Transaction ID:</strong></td><td><code>${transactionId || 'N/A'}</code></td></tr>
          <tr><td><strong>Payment Gateway:</strong></td><td>${paymentGateway}</td></tr>
          <tr><td><strong>Purchase Date:</strong></td><td>${purchaseDate || new Date().toLocaleString()}</td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.superAdminNotifyEmail,
      toName: 'Super Admin Team',
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'Manage Subscriptions',
        ctaUrl: `${this.frontendUrl}/super-admin/subscriptions`
      }),
      notificationType: 'SUPERADMIN_SUBSCRIPTION_PURCHASE',
      contextIds: { transactionId }
    });
  }

  /**
   * 3.C Successful Payment Notification
   */
  async sendSuperAdminPaymentSuccessNotification({ companyName, adminName, planName, transactionId, paymentGateway, amount, currency = 'INR', paymentDate, validity }) {
    const subject = `Payment Received – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">💰 Payment Verified & Received</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Payment has been verified successfully for company <strong>${companyName}</strong>.
      </p>
      <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #166534;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName}</td></tr>
          <tr><td><strong>HR Admin:</strong></td><td>${adminName}</td></tr>
          <tr><td><strong>Subscription Plan:</strong></td><td>${planName}</td></tr>
          <tr><td><strong>Amount Verified:</strong></td><td><strong>${currency} ${amount}</strong></td></tr>
          <tr><td><strong>Transaction Reference:</strong></td><td><code>${transactionId}</code></td></tr>
          <tr><td><strong>Gateway:</strong></td><td>${paymentGateway}</td></tr>
          <tr><td><strong>Payment Date:</strong></td><td>${paymentDate}</td></tr>
          <tr><td><strong>Validity Period:</strong></td><td>${validity}</td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.superAdminNotifyEmail,
      toName: 'Super Admin Team',
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({ title: subject, content }),
      notificationType: 'SUPERADMIN_PAYMENT_SUCCESS',
      contextIds: { transactionId }
    });
  }

  /**
   * 3.D Failed Payment Notification
   */
  async sendSuperAdminPaymentFailedNotification({ companyName, adminEmail, planName, transactionRef, paymentGateway, failureStatus, failureTimestamp }) {
    const subject = `Payment Failed – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #DC2626; font-size: 18px;">⚠️ Payment Transaction Failed</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        A payment attempt failed or could not be verified for <strong>${companyName}</strong>.
      </p>
      <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #991B1B;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName}</td></tr>
          <tr><td><strong>HR Admin Email:</strong></td><td>${adminEmail}</td></tr>
          <tr><td><strong>Target Plan:</strong></td><td>${planName}</td></tr>
          <tr><td><strong>Transaction Ref:</strong></td><td><code>${transactionRef || 'N/A'}</code></td></tr>
          <tr><td><strong>Payment Gateway:</strong></td><td>${paymentGateway || 'Razorpay'}</td></tr>
          <tr><td><strong>Failure Status:</strong></td><td>${failureStatus}</td></tr>
          <tr><td><strong>Failure Time:</strong></td><td>${failureTimestamp || new Date().toLocaleString()}</td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.superAdminNotifyEmail,
      toName: 'Super Admin Team',
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({ title: subject, content }),
      notificationType: 'SUPERADMIN_PAYMENT_FAILED',
      contextIds: { transactionId: transactionRef }
    });
  }

  /**
   * 3.E Upcoming Subscription Expiry (Super Admin)
   */
  async sendSuperAdminUpcomingExpiryNotification({ companyName, adminName, planName, expiryDate, daysRemaining, renewalStatus }) {
    const subject = `Subscription Expiring Soon – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #D97706; font-size: 18px;">⌛ Upcoming Tenant Subscription Expiry</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Subscription for <strong>${companyName}</strong> will expire in <strong style="color: #C62828;">${daysRemaining} day(s)</strong>.
      </p>
      <div style="background-color: #FFFBEB; border: 1px solid #FCD34D; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #78350F;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName}</td></tr>
          <tr><td><strong>HR Admin:</strong></td><td>${adminName}</td></tr>
          <tr><td><strong>Current Plan:</strong></td><td>${planName}</td></tr>
          <tr><td><strong>Expiry Date:</strong></td><td>${expiryDate}</td></tr>
          <tr><td><strong>Days Remaining:</strong></td><td><strong>${daysRemaining} Days</strong></td></tr>
          <tr><td><strong>Renewal Status:</strong></td><td>${renewalStatus || 'Pending Customer Action'}</td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.superAdminNotifyEmail,
      toName: 'Super Admin Team',
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({ title: subject, content }),
      notificationType: 'SUPERADMIN_UPCOMING_EXPIRY'
    });
  }

  /**
   * 3.F Subscription Expiry (Super Admin)
   */
  async sendSuperAdminSubscriptionExpiredNotification({ companyName, adminName, planName, expiryDate, currentStatus, renewalStatus }) {
    const subject = `Subscription Expired – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #991B1B; font-size: 18px;">🔴 Tenant Subscription Expired</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Subscription for corporate client <strong>${companyName}</strong> has expired. Account access status updated to inactive.
      </p>
      <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #7F1D1D;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName}</td></tr>
          <tr><td><strong>HR Admin:</strong></td><td>${adminName}</td></tr>
          <tr><td><strong>Plan Expired:</strong></td><td>${planName}</td></tr>
          <tr><td><strong>Expired Date:</strong></td><td>${expiryDate}</td></tr>
          <tr><td><strong>Current Account Status:</strong></td><td><strong style="color: #DC2626;">${currentStatus || 'Expired'}</strong></td></tr>
          <tr><td><strong>Renewal / Upgrade:</strong></td><td>${renewalStatus || 'Not Initiated'}</td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.superAdminNotifyEmail,
      toName: 'Super Admin Team',
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({ title: subject, content }),
      notificationType: 'SUPERADMIN_SUBSCRIPTION_EXPIRED'
    });
  }

  // ==========================================
  // SECTION 4: SUPPORT TICKET NOTIFICATIONS
  // Destination: support@kiaantechnology.com
  // ==========================================

  /**
   * 4.A New Support Ticket Notification to Kiaan Support Team
   * Destination: support@kiaantechnology.com
   */
  async sendSupportNewTicketNotification({
    ticketId,
    ticketNumber,
    companyName,
    companyId,
    department,
    employeeId,
    adminName,
    userName,
    adminEmail,
    userEmail,
    userPhone,
    userRole,
    subject: ticketSubject,
    category,
    priority,
    status = 'OPEN',
    createdAt,
    description,
    attachmentUrl,
    attachments
  }) {
    const finalTicketNum = ticketNumber || ticketId;
    const finalCompany = companyName || 'Corporate Account';
    const finalUserName = userName || adminName || 'Payroll User';
    const finalUserEmail = userEmail || adminEmail || 'user@company.com';
    const subject = `New Payroll Support Ticket #${finalTicketNum} - ${finalCompany}`;
    const recipientEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || process.env.SUPPORT_NOTIFY_EMAIL || 'support@kiaantechnology.com';

    const htmlContent = emailTemplates.payroll_support_ticket_notification({
      ticketNumber: finalTicketNum,
      companyName: finalCompany,
      companyId,
      department,
      employeeId,
      userName: finalUserName,
      userEmail: finalUserEmail,
      userPhone,
      userRole,
      category,
      priority,
      subject: ticketSubject,
      description,
      ticketStatus: status,
      createdAt,
      attachments: attachments || (attachmentUrl ? [attachmentUrl] : [])
    });

    return this.sendEmail({
      toEmail: recipientEmail,
      toName: 'Kiaan Support Team',
      fromEmail: this.supportEmail,
      fromName: 'Kiaan Support Desk Router',
      subject,
      htmlContent,
      notificationType: 'SUPPORT_NEW_TICKET',
      contextIds: { ticketId: finalTicketNum }
    });
  }

  /**
   * 4.A2 Custom Payroll Software Requirement Notification to Support Team
   * Recipient: support@kiaantechnology.com
   * Sender: info@kiaantechnology.com
   * Subject: "New Custom Payroll Software Requirement"
   */
  async sendCustomPlanRequirementNotification({ name, email, companyName, employeeCount, requirements, createdAt }) {
    const primarySupportEmail = process.env.SUPPORT_NOTIFICATION_EMAIL || 'support@kiaantechnology.com';
    const secondaryAdminEmail = process.env.BREVO_SENDER_EMAIL || process.env.SENDER_INFO_EMAIL || 'info@kiaantechnology.com';
    const senderEmail = process.env.SENDER_INFO_EMAIL || 'info@kiaantechnology.com';
    const subject = 'New Custom Payroll Software Requirement';

    const htmlContent = emailTemplates.custom_plan_requirement({
      name,
      email,
      companyName,
      employeeCount,
      requirements,
      createdAt
    });

    // 1. Send to Primary Support Email (support@kiaantechnology.com)
    await this.sendEmail({
      toEmail: primarySupportEmail,
      toName: 'Kiaan Support Team',
      fromEmail: senderEmail,
      fromName: 'Kiaan Enterprise System',
      subject,
      htmlContent,
      notificationType: 'CUSTOM_PLAN_REQUEST'
    });

    // 2. Send to Secondary Admin Email (info@kiaantechnology.com) if distinct
    if (secondaryAdminEmail.toLowerCase() !== primarySupportEmail.toLowerCase()) {
      await this.sendEmail({
        toEmail: secondaryAdminEmail,
        toName: 'Kiaan Sales & Admin Team',
        fromEmail: senderEmail,
        fromName: 'Kiaan Enterprise System',
        subject,
        htmlContent,
        notificationType: 'CUSTOM_PLAN_REQUEST'
      }).catch(err => console.error('❌ [Brevo Error] Secondary admin email dispatch failed:', err.message));
    }
  }

  /**
   * 4.B New HR Admin Reply
   */
  async sendSupportCustomerReplyNotification({ ticketId, companyName, subject: ticketSubject, senderName, replyTimestamp, messagePreview, ticketUrl }) {
    const subject = `New Customer Reply – ${ticketId}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 18px;">💬 Customer Reply Received</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Customer <strong>${senderName}</strong> (${companyName}) posted a new reply to support ticket <strong>${ticketId}</strong>.
      </p>
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748B;">Ticket: <strong>${ticketId} - ${ticketSubject}</strong> | Timestamp: ${replyTimestamp || new Date().toLocaleString()}</p>
        <div style="background-color: #FFFFFF; border: 1px solid #CBD5E1; padding: 14px; border-radius: 6px; margin-top: 10px;">
          <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.5;">${messagePreview}</p>
        </div>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.supportNotifyEmail,
      toName: 'Kiaan Support Desk',
      fromEmail: this.supportEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'Open Conversation',
        ctaUrl: ticketUrl || `${this.frontendUrl}/super-admin/support`
      }),
      notificationType: 'SUPPORT_CUSTOMER_REPLY',
      contextIds: { ticketId }
    });
  }

  /**
   * 4.C Ticket Reopened
   */
  async sendSupportTicketReopenedNotification({ ticketId, companyName, subject: ticketSubject, reopenedBy, reopeningDate, previousStatus, currentStatus, ticketUrl }) {
    const subject = `Support Ticket Reopened – ${ticketId}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #D97706; font-size: 18px;">🔄 Support Ticket Reopened</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Closed ticket <strong>${ticketId}</strong> was reopened by <strong>${reopenedBy}</strong> (${companyName}).
      </p>
      <div style="background-color: #FFFBEB; border: 1px solid #FCD34D; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #78350F;">
          <tr><td width="35%"><strong>Ticket ID:</strong></td><td>${ticketId}</td></tr>
          <tr><td><strong>Subject:</strong></td><td>${ticketSubject}</td></tr>
          <tr><td><strong>Reopened By:</strong></td><td>${reopenedBy}</td></tr>
          <tr><td><strong>Reopen Timestamp:</strong></td><td>${reopeningDate || new Date().toLocaleString()}</td></tr>
          <tr><td><strong>Previous Status:</strong></td><td>${previousStatus || 'Closed'}</td></tr>
          <tr><td><strong>New Status:</strong></td><td><strong style="color: #D97706;">${currentStatus || 'Open'}</strong></td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.supportNotifyEmail,
      toName: 'Kiaan Support Desk',
      fromEmail: this.supportEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'View Reopened Ticket',
        ctaUrl: ticketUrl || `${this.frontendUrl}/super-admin/support`
      }),
      notificationType: 'SUPPORT_TICKET_REOPENED',
      contextIds: { ticketId }
    });
  }

  /**
   * 4.D Ticket Priority Changes (Escalated to Urgent/High)
   */
  async sendSupportTicketEscalatedNotification({ ticketId, companyName, adminName, subject: ticketSubject, newPriority, ticketUrl }) {
    const subject = `🚨 Ticket Priority Escalated [${newPriority}] – ${ticketId}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #DC2626; font-size: 18px;">🚨 Ticket Escalated to ${newPriority}</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Support ticket <strong>${ticketId}</strong> for <strong>${companyName}</strong> has been flagged as <strong>${newPriority} Priority</strong>.
      </p>
      <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #991B1B;"><strong>Subject:</strong> ${ticketSubject}</p>
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #991B1B;"><strong>Customer:</strong> ${adminName} (${companyName})</p>
        <p style="margin: 0; font-size: 14px; color: #991B1B;"><strong>Priority Level:</strong> <span style="background: #DC2626; color: white; padding: 2px 8px; border-radius: 4px;">${newPriority}</span></p>
      </div>
    `;
    return this.sendEmail({
      toEmail: this.supportNotifyEmail,
      toName: 'Kiaan Support Desk',
      fromEmail: this.supportEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'Handle Urgent Ticket Immediately',
        ctaUrl: ticketUrl || `${this.frontendUrl}/super-admin/support`
      }),
      notificationType: 'SUPPORT_TICKET_ESCALATED',
      contextIds: { ticketId }
    });
  }

  /**
   * 4.E Super Admin Replies to HR Admin
   * (STRICT SECURITY RULE: Internal notes with is_internal=true MUST NEVER call this!)
   */
  async sendHRAdminSupportReplyNotification({ ticketId, subject: ticketSubject, supportTeamName = 'Kiaan Support Team', replyPreview, ticketUrl, toEmail, toName }) {
    const subject = `Support Reply – ${ticketId} – ${ticketSubject}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 18px;">Update on Support Ticket ${ticketId}</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Hello ${toName || 'HR Admin'},
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Our support team has posted an official response to your ticket:
      </p>
      <div style="background-color: #F8FAFC; border-left: 4px solid #C62828; padding: 18px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748B; font-weight: bold;">Response from ${supportTeamName}:</p>
        <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.6;">${replyPreview}</p>
      </div>
    `;
    return this.sendEmail({
      toEmail,
      toName,
      fromEmail: this.supportEmail,
      fromName: 'Kiaan Support Team',
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'View Ticket in HR Portal',
        ctaUrl: ticketUrl || `${this.frontendUrl}/support`
      }),
      notificationType: 'HR_ADMIN_SUPPORT_REPLY',
      contextIds: { ticketId }
    });
  }

  // ==========================================
  // SECTION 5: HR ADMIN WELCOME & ACTIVATION
  // Destination: HR Admin Work Email
  // ==========================================

  /**
   * 5. HR Admin Welcome Email with Single-Use Secure Password Setup Token
   */
  async sendHRAdminWelcomeActivationEmail({ email, name, companyName, portalUrl, activationUrl, expiresHours = 24 }) {
    const subject = `Welcome to Kiaan Payroll & HRMS – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #C62828; font-size: 20px;">Welcome to Kiaan Payroll & HRMS! 🎉</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 15px; line-height: 1.6;">
        Dear <strong>${name}</strong>,
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        We are thrilled to welcome <strong>${companyName}</strong> to the Kiaan Technology Multi-Tenant Payroll & HRMS SaaS Platform. Your corporate HR Admin environment is ready.
      </p>
      <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; color: #991B1B; font-weight: bold; font-size: 14px;">🔒 Secure Account Password Setup Required</p>
        <p style="margin: 0; color: #7F1D1D; font-size: 13px; line-height: 1.5;">
          For security compliance, we do not issue plaintext passwords via email. Please click the button below to establish your confidential password and activate your HR Admin account. This link is single-use and valid for <strong>${expiresHours} hours</strong>.
        </p>
      </div>
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 13px; color: #334155;">
        <p style="margin: 2px 0;"><strong>Registered Work Email:</strong> ${email}</p>
        <p style="margin: 2px 0;"><strong>Organization:</strong> ${companyName}</p>
        <p style="margin: 2px 0;"><strong>Admin Portal URL:</strong> <a href="${portalUrl || this.frontendUrl}" style="color: #C62828;">${portalUrl || this.frontendUrl}</a></p>
        <p style="margin: 2px 0;"><strong>Support Desk Email:</strong> <a href="mailto:support@kiaantechnology.com" style="color: #C62828;">support@kiaantechnology.com</a></p>
      </div>
    `;
    return this.sendEmail({
      toEmail: email,
      toName: name,
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'Activate Account & Set Password',
        ctaUrl: activationUrl,
        footerNote: 'If you did not register this corporate account, please contact our security team immediately at support@kiaantechnology.com.'
      }),
      notificationType: 'HR_ADMIN_WELCOME_ACTIVATION'
    });
  }

  /**
   * Password Reset OTP Email
   */
  async sendPasswordResetOTPEmail({ email, name, otp }) {
    const subject = `Password Reset Verification Code – ${otp}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #C62828; font-size: 20px;">Password Reset Verification Code</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Hello <strong>${name || 'User'}</strong>,
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        We received a request to reset the password for your Kiaan Payroll & HRMS SaaS account. Use the 6-digit OTP code below to verify your identity.
      </p>
      <div style="background-color: #FEF2F2; border: 2px dashed #C62828; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #C62828;">${otp}</span>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #991B1B;">This verification code is valid for 10 minutes only.</p>
      </div>
      <p style="margin: 0; color: #64748B; font-size: 13px;">
        If you did not request a password reset, please ignore this email or contact support immediately at <a href="mailto:support@kiaantechnology.com" style="color: #C62828;">support@kiaantechnology.com</a>.
      </p>
    `;
    return this.sendEmail({
      toEmail: email,
      toName: name,
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content
      }),
      notificationType: 'PASSWORD_RESET_OTP'
    });
  }

  // ==========================================
  // SECTION 6 & 7: HR ADMIN SUBSCRIPTION & PAYMENT
  // ==========================================

  /**
   * 6. HR Admin Subscription Plan Confirmation Email
   */
  async sendHRAdminSubscriptionConfirmationEmail({ email, name, companyName, planName, price, currency = 'INR', billingFrequency = 'Monthly', startDate, expiryDate, maxEmployees, features = [], paymentStatus = 'Active', transactionId, paymentGateway, invoiceUrl, portalUrl }) {
    const subject = `Your Subscription Is Active – ${planName}`;
    const featureList = Array.isArray(features) ? features.map(f => `<li style="margin-bottom: 4px;">${f}</li>`).join('') : `<li>Automated Payroll & Tax Compliance</li><li>Biometric Sync</li><li>Employee Self-Service</li>`;

    const content = `
      <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 20px;">Subscription Activated Successfully! 🎉</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Dear <strong>${name}</strong>,
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Your subscription plan <strong>${planName}</strong> for <strong>${companyName}</strong> is now live and fully operational.
      </p>
      <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #166534;">
          <tr><td width="40%"><strong>Plan Name:</strong></td><td><strong style="color: #059669;">${planName}</strong></td></tr>
          <tr><td><strong>Subscription Fee:</strong></td><td>${currency} ${price} / ${billingFrequency}</td></tr>
          <tr><td><strong>Employee Limit:</strong></td><td>Up to ${maxEmployees || 'Unlimited'} Employees</td></tr>
          <tr><td><strong>Start Date:</strong></td><td>${startDate}</td></tr>
          <tr><td><strong>Expiry Date:</strong></td><td>${expiryDate}</td></tr>
          <tr><td><strong>Payment Status:</strong></td><td><span style="background: #166534; color: white; padding: 2px 8px; border-radius: 4px;">${paymentStatus}</span></td></tr>
          ${transactionId ? `<tr><td><strong>Transaction ID:</strong></td><td><code>${transactionId}</code></td></tr>` : ''}
          ${paymentGateway ? `<tr><td><strong>Payment Gateway:</strong></td><td>${paymentGateway}</td></tr>` : ''}
        </table>
      </div>
      <h4 style="margin: 16px 0 8px 0; color: #0F172A;">Included Plan Features:</h4>
      <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #475569; font-size: 13px;">
        ${featureList}
      </ul>
    `;
    return this.sendEmail({
      toEmail: email,
      toName: name,
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'Go to HR Admin Dashboard',
        ctaUrl: portalUrl || `${this.frontendUrl}/admin`,
        footerNote: invoiceUrl ? `Tax Invoice is ready for download: <a href="${invoiceUrl}" style="color: #C62828;">Download Invoice PDF</a>` : null
      }),
      notificationType: 'HR_ADMIN_SUBSCRIPTION_CONFIRMATION',
      contextIds: { transactionId }
    });
  }

  /**
   * 7. HR Admin Payment Confirmation Email
   */
  async sendHRAdminPaymentConfirmationEmail({ email, name, companyName, transactionId, planName, amount, currency = 'INR', paymentGateway, paymentDate, paymentStatus = 'SUCCESS', invoiceUrl }) {
    const subject = `Payment Confirmation – ${companyName}`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #059669; font-size: 18px;">Payment Verified & Receipt Issued</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Dear ${name || 'HR Admin'},
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Thank you for your payment. We have successfully processed your transaction for <strong>${companyName}</strong>.
      </p>
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #334155;">
          <tr><td width="40%"><strong>Company Name:</strong></td><td>${companyName}</td></tr>
          <tr><td><strong>Plan:</strong></td><td>${planName}</td></tr>
          <tr><td><strong>Amount Paid:</strong></td><td><strong style="color: #059669;">${currency} ${amount}</strong></td></tr>
          <tr><td><strong>Transaction Reference:</strong></td><td><code>${transactionId}</code></td></tr>
          <tr><td><strong>Payment Gateway:</strong></td><td>${paymentGateway || 'Razorpay'}</td></tr>
          <tr><td><strong>Payment Date:</strong></td><td>${paymentDate || new Date().toLocaleDateString()}</td></tr>
          <tr><td><strong>Status:</strong></td><td><span style="color: #059669; font-weight: bold;">${paymentStatus}</span></td></tr>
        </table>
      </div>
    `;
    return this.sendEmail({
      toEmail: email,
      toName: name,
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: invoiceUrl ? 'Download Official Receipt / Invoice' : 'View Account',
        ctaUrl: invoiceUrl || `${this.frontendUrl}/admin/billing`
      }),
      notificationType: 'HR_ADMIN_PAYMENT_CONFIRMATION',
      contextIds: { transactionId }
    });
  }

  // ==========================================
  // SECTION 8: AUTOMATED EXPIRY & UPGRADE EMAILS
  // ==========================================

  /**
   * 8.A Upcoming Expiry Reminder (HR Admin)
   */
  async sendHRAdminUpcomingExpiryReminder({ email, name, companyName, planName, expiryDate, daysRemaining, renewUrl }) {
    let daysSubject = `Your HRMS Subscription Expires in ${daysRemaining} Days`;
    if (daysRemaining === 1) {
      daysSubject = `Your HRMS Subscription Expires Tomorrow`;
    }

    const content = `
      <h2 style="margin: 0 0 16px 0; color: #D97706; font-size: 18px;">⚠️ HRMS Subscription Expiring in ${daysRemaining} Day(s)</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Dear <strong>${name || 'HR Admin'}</strong>,
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        This is an automated reminder that your <strong>${planName}</strong> plan subscription for <strong>${companyName}</strong> will expire on <strong>${expiryDate}</strong> (${daysRemaining} days remaining).
      </p>
      <div style="background-color: #FFFBEB; border: 1px solid #FCD34D; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px 0; color: #B45309; font-size: 14px; font-weight: bold;">Keep Your HR Operations Running Smoothly</p>
        <p style="margin: 0; color: #78350F; font-size: 13px; line-height: 1.5;">
          Renewing your subscription ensures uninterrupted access to automated payroll processing, employee attendance sync, tax calculations, and compliance reports.
        </p>
      </div>
    `;
    return this.sendEmail({
      toEmail: email,
      toName: name,
      fromEmail: this.infoEmail,
      subject: daysSubject,
      htmlContent: this._buildEmailLayout({
        title: daysSubject,
        content,
        ctaText: 'Renew or Upgrade Plan Now',
        ctaUrl: renewUrl || `${this.frontendUrl}/admin/billing`
      }),
      notificationType: `HR_ADMIN_EXPIRY_REMINDER_${daysRemaining}D`
    });
  }

  /**
   * 8.B Subscription Expired Email (HR Admin)
   */
  async sendHRAdminSubscriptionExpiredEmail({ email, name, companyName, planName, expiryDate, renewUrl }) {
    const subject = `Your HRMS Subscription Has Expired – Renew or Upgrade`;
    const content = `
      <h2 style="margin: 0 0 16px 0; color: #991B1B; font-size: 18px;">🔴 Your Kiaan HRMS Subscription Has Expired</h2>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Dear <strong>${name || 'HR Admin'}</strong>,
      </p>
      <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
        Your subscription plan (<strong>${planName}</strong>) for <strong>${companyName}</strong> expired on <strong>${expiryDate}</strong>.
      </p>
      <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 6px 0; color: #991B1B; font-weight: bold; font-size: 14px;">Account Status: Access Restricted</p>
        <p style="margin: 0; color: #7F1D1D; font-size: 13px; line-height: 1.5;">
          All your company records, employee data, and historical payroll logs remain 100% safe and encrypted. However, active payroll calculation and new employee onboarding are paused until your plan is renewed or upgraded.
        </p>
      </div>
    `;
    return this.sendEmail({
      toEmail: email,
      toName: name,
      fromEmail: this.infoEmail,
      subject,
      htmlContent: this._buildEmailLayout({
        title: subject,
        content,
        ctaText: 'Renew or Upgrade Plan Immediately',
        ctaUrl: renewUrl || `${this.frontendUrl}/admin/billing`
      }),
      notificationType: 'HR_ADMIN_SUBSCRIPTION_EXPIRED'
    });
  }

  /**
   * Diagnostic Test Function for Email Configuration
   */
  async testEmailConfiguration() {
    console.log('🧪 Testing Brevo Email Provider Configuration...');
    if (!this.apiKey) {
      return { success: false, message: 'BREVO_API_KEY is missing in backend environment.' };
    }
    const testResult = await this.sendEmail({
      toEmail: this.infoEmail,
      toName: 'Test Diagnostics',
      subject: '🧪 Email Notification System - Configuration Test',
      htmlContent: this._buildEmailLayout({
        title: 'Email Diagnostics Successful',
        content: `
          <h3 style="color: #059669;">System Diagnostic Successful ✅</h3>
          <p>This is a test notification confirming that the Kiaan Technology Brevo API connection and email notification router are working correctly.</p>
        `
      }),
      notificationType: 'SYSTEM_TEST_DIAGNOSTIC'
    });
    return testResult;
  }
}

module.exports = new EmailService();
