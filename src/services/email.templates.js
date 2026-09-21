/**
 * Kiaan Technology - Workforce & Payroll Email Templates
 */

const formatISTDate = (date) => {
  if (!date) return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
  } catch (e) {
    return String(date);
  }
};

const emailTemplates = {
  /**
   * Payroll Support Ticket Notification Template
   * Sent to support@kiaantechnology.com when a new support ticket is created
   */
  payroll_support_ticket_notification: ({
    ticketNumber,
    companyName,
    companyId,
    department,
    employeeId,
    userName,
    userEmail,
    userPhone,
    userRole,
    category,
    priority,
    subject,
    description,
    ticketStatus = 'OPEN',
    createdAt,
    attachments = []
  }) => {
    const formattedDate = formatISTDate(createdAt);
    const pStr = String(priority || 'Normal').toUpperCase();
    const priorityColor = pStr === 'URGENT' ? '#DC2626' : pStr === 'HIGH' ? '#EA580C' : pStr === 'LOW' ? '#16A34A' : '#D97706';
    const priorityBg = pStr === 'URGENT' ? '#FEE2E2' : pStr === 'HIGH' ? '#FFEDD5' : pStr === 'LOW' ? '#DCFCE7' : '#FEF3C7';

    // Format attachments section
    let attachmentsHtml = '';
    if (Array.isArray(attachments) && attachments.length > 0) {
      attachmentsHtml = `
        <tr>
          <td colspan="2" style="padding-top: 8px;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569; font-weight: bold; text-transform: uppercase;">Attachments (${attachments.length}):</p>
            <ul style="margin: 0; padding-left: 20px; color: #1E293B; font-size: 13px;">
              ${attachments.map(att => {
                const url = typeof att === 'string' ? att : (att.url || att.link || '#');
                const name = typeof att === 'string' ? att.split('/').pop() : (att.name || att.filename || 'View Attached File');
                const size = att.size ? ` (${att.size})` : '';
                return `
                <li style="margin-bottom: 4px;">
                  <a href="${url}" target="_blank" style="color: #C62828; font-weight: bold; text-decoration: underline;">
                    ${name}
                  </a>${size}
                </li>
              `;
              }).join('')}
            </ul>
          </td>
        </tr>
      `;
    } else if (typeof attachments === 'string' && attachments.trim()) {
      attachmentsHtml = `
        <tr>
          <td colspan="2" style="padding-top: 8px;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569; font-weight: bold; text-transform: uppercase;">Attached File:</p>
            <a href="${attachments}" target="_blank" style="color: #C62828; font-weight: bold; text-decoration: underline; font-size: 13px;">
              View / Download Ticket Attachment
            </a>
          </td>
        </tr>
      `;
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Payroll Support Ticket #${ticketNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 650px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <!-- BRANDING HEADER -->
          <tr>
            <td style="background-color: #0F172A; padding: 24px 32px; border-bottom: 3px solid #C62828;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">KIAAN TECHNOLOGY</h1>
                    <p style="margin: 4px 0 0 0; color: #EF4444; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Workforce & Payroll</p>
                  </td>
                  <td align="right">
                    <div style="background-color: #C62828; color: #FFFFFF; font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">
                      PAYROLL SUPPORT TICKET #${ticketNumber}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- TICKET SUMMARY BOX -->
          <tr>
            <td style="padding: 28px 32px 16px 32px;">
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 16px 0; color: #0F172A; font-size: 16px; font-weight: 700; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px;">
                  🎫 Ticket Information
                </h3>
                <table width="100%" border="0" cellspacing="0" cellpadding="5" style="font-size: 13.5px; color: #334155;">
                  <tr>
                    <td width="35%"><strong>Subject:</strong></td>
                    <td><strong style="color: #0F172A;">${subject}</strong></td>
                  </tr>
                  <tr>
                    <td><strong>Category:</strong></td>
                    <td><span style="background-color: #E2E8F0; color: #1E293B; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${category || 'General Support'}</span></td>
                  </tr>
                  <tr>
                    <td><strong>Priority:</strong></td>
                    <td><span style="background-color: ${priorityBg}; color: ${priorityColor}; padding: 2px 10px; border-radius: 4px; font-weight: 800; text-transform: uppercase; font-size: 11px;">${pStr}</span></td>
                  </tr>
                  <tr>
                    <td><strong>Status:</strong></td>
                    <td><span style="background-color: #DCFCE7; color: #15803D; padding: 2px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase; font-size: 11px;">${String(ticketStatus).toUpperCase()}</span></td>
                  </tr>
                  <tr>
                    <td><strong>Created:</strong></td>
                    <td>${formattedDate}</td>
                  </tr>
                </table>
              </div>

              <!-- TWO COLUMN CARDS: USER & ORGANIZATION -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <!-- PAYROLL USER INFO -->
                  <td width="48%" valign="top" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px;">
                    <h4 style="margin: 0 0 12px 0; color: #0F172A; font-size: 14px; font-weight: 700; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">
                      👤 Payroll User
                    </h4>
                    <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 13px; color: #334155;">
                      <tr><td><strong>Name:</strong></td><td>${userName || 'N/A'}</td></tr>
                      <tr><td><strong>Email:</strong></td><td><a href="mailto:${userEmail}" style="color: #C62828; text-decoration: none; font-weight: 600;">${userEmail}</a></td></tr>
                      <tr><td><strong>Phone:</strong></td><td>${userPhone || 'N/A'}</td></tr>
                      <tr><td><strong>Role:</strong></td><td><span style="background-color: #E0F2FE; color: #0369A1; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${userRole || 'Payroll User'}</span></td></tr>
                    </table>
                  </td>
                  
                  <td width="4%"></td>

                  <!-- COMPANY / ORGANIZATION INFO -->
                  <td width="48%" valign="top" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px;">
                    <h4 style="margin: 0 0 12px 0; color: #0F172A; font-size: 14px; font-weight: 700; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">
                      🏢 Company / Organization
                    </h4>
                    <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 13px; color: #334155;">
                      <tr><td><strong>Company:</strong></td><td><strong>${companyName || 'N/A'}</strong></td></tr>
                      ${companyId ? `<tr><td><strong>Company ID:</strong></td><td><code>${companyId}</code></td></tr>` : ''}
                      ${department ? `<tr><td><strong>Department:</strong></td><td>${department}</td></tr>` : ''}
                      ${employeeId ? `<tr><td><strong>Employee ID:</strong></td><td><code>${employeeId}</code></td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- ISSUE DESCRIPTION SECTION -->
              <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 12px 0; color: #0F172A; font-size: 14px; font-weight: 700;">
                  📝 Issue Description
                </h4>
                <div style="background-color: #F8FAFC; border-left: 4px solid #C62828; padding: 16px; border-radius: 4px; color: #1E293B; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${description}</div>
              </div>

              ${attachmentsHtml ? `
                <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0">
                    ${attachmentsHtml}
                  </table>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0 0 6px 0; color: #64748B; font-size: 12px;">This support ticket was submitted from the <strong>Kiaan Workforce & Payroll</strong> system.</p>
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
  },

  /**
   * Custom Payroll Software Requirement Template
   * Sent to support@kiaantechnology.com when a customer submits a Custom Plan Request
   */
  custom_plan_requirement: ({ name, email, companyName, employeeCount, requirements, createdAt }) => {
    const formattedDate = formatISTDate(createdAt);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>New Custom Payroll Software Requirement</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px;">
  <div style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #C62828 0%, #B71C1C 100%); padding: 28px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 1px;">KIAAN PAYROLL SOFTWARE</h1>
      <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.95; font-weight: 500;">New Custom Enterprise Payroll Requirement Received</p>
    </div>

    <!-- Body Content -->
    <div style="padding: 30px;">
      <h3 style="color: #1E293B; font-size: 17px; margin-top: 0; margin-bottom: 16px; border-bottom: 2px solid #F1F5F9; padding-bottom: 8px;">
        👤 Customer Details
      </h3>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px;">
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 0; font-weight: bold; color: #475569; width: 40%;">HR / Admin Name:</td>
          <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">${name}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 0; font-weight: bold; color: #475569;">Email Address:</td>
          <td style="padding: 10px 0; color: #0F172A;"><a href="mailto:${email}" style="color: #C62828; text-decoration: none; font-weight: bold;">${email}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 0; font-weight: bold; color: #475569;">Company Name:</td>
          <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">${companyName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 0; font-weight: bold; color: #475569;">Total Employees / Scale:</td>
          <td style="padding: 10px 0; color: #C62828; font-weight: 800;">${employeeCount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: bold; color: #475569;">Request Date & Time (IST):</td>
          <td style="padding: 10px 0; color: #64748B;">${formattedDate}</td>
        </tr>
      </table>

      <h3 style="color: #1E293B; font-size: 16px; margin-top: 25px; margin-bottom: 12px; border-bottom: 2px solid #F1F5F9; padding-bottom: 8px;">
        📝 Detailed Customization Requirements
      </h3>

      <div style="background-color: #F8FAFC; border-left: 4px solid #C62828; padding: 18px; border-radius: 6px; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${requirements}</div>

      <div style="margin-top: 30px; background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 14px; text-align: center; color: #991B1B; font-size: 13px;">
        <strong>Action Required:</strong> Please contact the customer to discuss customized pricing, statutory compliance setups, and account onboarding.
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #F1F5F9; padding: 20px; text-align: center; border-top: 1px solid #E2E8F0;">
      <p style="margin: 0 0 4px 0; color: #64748B; font-size: 12px; font-weight: bold;">Kiaan Technology Enterprise Payroll System</p>
      <p style="margin: 0; color: #94A3B8; font-size: 11px;">Primary Support Desk: support@kiaantechnology.com</p>
    </div>
  </div>
</body>
</html>
    `;
  }
};

module.exports = emailTemplates;
