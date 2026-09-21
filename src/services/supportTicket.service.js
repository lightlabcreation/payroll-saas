const db = require('../config/mysql');
const emailService = require('./email.service');

class SupportTicketService {
  /**
   * Create a new Support Ticket by Payroll user (HR Admin / User)
   * Workflow:
   * 1. Validate user & data
   * 2. Begin DB Transaction
   * 3. Insert into support_tickets (PAY-TKT-YYYYMMDD-XXXX format)
   * 4. Insert initial message with attachment_url if present
   * 5. Commit Transaction
   * 6. Trigger email dispatch to support@kiaantechnology.com asynchronously (Failure safe: error will not delete/rollback ticket)
   */
  async createTicket({ companyId, companyName, userId, contactName, contactEmail, subject, category = 'General', priority = 'Normal', message, attachmentUrl = null }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Format ticket number: PAY-TKT-YYYYMMDD-XXXX
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomNum = String(Math.floor(1000 + Math.random() * 9000));
      const ticketNumber = `PAY-TKT-${dateStr}-${randomNum}`;

      // 1. Save ticket in database
      const [result] = await connection.query(
        `INSERT INTO support_tickets 
          (ticket_number, company_id, company_name, user_id, contact_name, contact_email, subject, category, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', NOW(), NOW())`,
        [ticketNumber, companyId || null, companyName, userId || null, contactName, contactEmail, subject, category, priority]
      );

      const ticketId = result.insertId;

      // 2. Save initial ticket message & attachments
      await connection.query(
        `INSERT INTO support_ticket_messages
          (ticket_id, sender_id, sender_name, role, message, attachment_url, is_internal, created_at)
         VALUES (?, ?, ?, 'customer', ?, ?, 0, NOW())`,
        [ticketId, userId || null, contactName, message, attachmentUrl || null]
      );

      // 3. Commit database transaction
      await connection.commit();

      // Fetch user phone & role if userId present
      let userPhone = null;
      let userRole = 'Payroll User';
      if (userId) {
        try {
          const [uRows] = await db.query('SELECT phone, role FROM users WHERE id = ?', [userId]);
          if (uRows[0]) {
            userPhone = uRows[0].phone || null;
            const r = uRows[0].role;
            userRole = r === 'admin' ? 'Payroll Admin' : r === 'superadmin' ? 'Super Admin' : r === 'employer' ? 'Company Admin' : r === 'employee' ? 'Employee' : r;
          }
        } catch (e) {
          // ignore lookup error
        }
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const ticketUrl = `${frontendUrl}/superadmin/support-tickets`;

      let fullAttachmentLink = null;
      if (attachmentUrl) {
        fullAttachmentLink = attachmentUrl.startsWith('http') ? attachmentUrl : `${frontendUrl}${attachmentUrl}`;
      }

      // 4. Trigger Support Email Notification to support@kiaantechnology.com AFTER commit
      // FAILURE HANDLING: Email failure must NOT delete or rollback the successfully saved ticket!
      emailService.sendSupportNewTicketNotification({
        ticketId: ticketNumber,
        ticketNumber,
        companyName,
        companyId,
        userName: contactName,
        userEmail: contactEmail,
        userPhone,
        userRole,
        subject,
        category,
        priority,
        status: 'OPEN',
        createdAt: new Date(),
        description: message,
        attachmentUrl: fullAttachmentLink,
        ticketUrl
      }).catch(err => {
        console.error(`❌ [Support Email Failure Handled Silently - Ticket Retained]: ${err.message}`);
      });

      return { id: ticketId, ticketNumber, subject, status: 'Open', attachmentUrl };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all tickets with filtering and internal note protection
   */
  async getAllTickets({ isSuperAdmin = false, userId = null, companyId = null, status = null, priority = null, search = null }) {
    let sql = `
      SELECT t.*, 
        (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id ${isSuperAdmin ? '' : 'AND m.is_internal = 0'}) as message_count,
        (SELECT m.created_at FROM support_ticket_messages m WHERE m.ticket_id = t.id ${isSuperAdmin ? '' : 'AND m.is_internal = 0'} ORDER BY m.created_at DESC LIMIT 1) as last_activity
      FROM support_tickets t
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperAdmin) {
      if (companyId) {
        sql += ` AND t.company_id = ?`;
        params.push(companyId);
      } else if (userId) {
        sql += ` AND t.user_id = ?`;
        params.push(userId);
      }
    }

    if (status && status !== 'All') {
      sql += ` AND t.status = ?`;
      params.push(status);
    }

    if (priority && priority !== 'All') {
      sql += ` AND t.priority = ?`;
      params.push(priority);
    }

    if (search) {
      sql += ` AND (t.ticket_number LIKE ? OR t.subject LIKE ? OR t.company_name LIKE ? OR t.contact_name LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ` ORDER BY t.updated_at DESC`;

    const [tickets] = await db.query(sql, params);

    // Fetch messages for each ticket according to permissions
    for (let ticket of tickets) {
      let msgSql = `SELECT * FROM support_ticket_messages WHERE ticket_id = ?`;
      if (!isSuperAdmin) {
        // STRICT ENFORCEMENT: Customer HR Admins NEVER receive internal staff notes!
        msgSql += ` AND is_internal = 0`;
      }
      msgSql += ` ORDER BY created_at ASC`;

      const [messages] = await db.query(msgSql, [ticket.id]);
      ticket.messages = messages;
    }

    return tickets;
  }

  /**
   * Add message / reply to support ticket with internal note enforcement
   */
  async addReply({ ticketId, senderId, senderName, role, message, isInternal = false, newPriority = null }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [[ticket]] = await connection.query(`SELECT * FROM support_tickets WHERE id = ? OR ticket_number = ?`, [ticketId, ticketId]);
      if (!ticket) {
        throw new Error('Support ticket not found.');
      }

      const previousStatus = ticket.status;
      let updatedStatus = ticket.status;

      // Handle Reopening if ticket was closed/resolved and customer replies
      if (role === 'customer' && (previousStatus === 'Closed' || previousStatus === 'Resolved')) {
        updatedStatus = 'Open';
      } else if (role === 'staff' && !isInternal && ticket.status === 'Open') {
        updatedStatus = 'In Progress';
      }

      // 1. Insert Message
      await connection.query(
        `INSERT INTO support_ticket_messages
          (ticket_id, sender_id, sender_name, role, message, is_internal, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [ticket.id, senderId || null, senderName, role, message, isInternal ? 1 : 0]
      );

      // 2. Update Ticket Status & Priority if changed
      let priorityToSet = ticket.priority;
      if (newPriority && newPriority !== ticket.priority) {
        priorityToSet = newPriority;
      }

      await connection.query(
        `UPDATE support_tickets SET status = ?, priority = ?, updated_at = NOW() WHERE id = ?`,
        [updatedStatus, priorityToSet, ticket.id]
      );

      await connection.commit();

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      // 3. Dispatch Emails according to event role and internal flag
      if (role === 'customer') {
        // HR Admin reply or reopen
        if (previousStatus === 'Closed' || previousStatus === 'Resolved') {
          // Reopened notification
          emailService.sendSupportTicketReopenedNotification({
            ticketId: ticket.ticket_number,
            companyName: ticket.company_name,
            subject: ticket.subject,
            reopenedBy: senderName,
            reopeningDate: new Date().toLocaleString(),
            previousStatus,
            currentStatus: 'Open',
            ticketUrl: `${frontendUrl}/super-admin/support`
          }).catch(err => console.error(`[Email Error]: ${err.message}`));
        } else {
          // Normal customer reply
          emailService.sendSupportCustomerReplyNotification({
            ticketId: ticket.ticket_number,
            companyName: ticket.company_name,
            subject: ticket.subject,
            senderName,
            replyTimestamp: new Date().toLocaleString(),
            messagePreview: message,
            ticketUrl: `${frontendUrl}/super-admin/support`
          }).catch(err => console.error(`[Email Error]: ${err.message}`));
        }
      } else if (role === 'staff') {
        // Super Admin staff response
        if (isInternal) {
          // STRICT SECURITY REQUIREMENT:
          // Internal notes MUST NOT be sent to HR Admin or customer email!
          console.log(`🔒 Internal staff note saved for ticket ${ticket.ticket_number}. Email dispatch omitted as per security policy.`);
        } else {
          // Customer-facing Super Admin reply -> Send email to HR Admin
          emailService.sendHRAdminSupportReplyNotification({
            ticketId: ticket.ticket_number,
            subject: ticket.subject,
            supportTeamName: 'Kiaan Support Team',
            replyPreview: message,
            ticketUrl: `${frontendUrl}/support`,
            toEmail: ticket.contact_email,
            toName: ticket.contact_name
          }).catch(err => console.error(`[Email Error]: ${err.message}`));
        }
      }

      // Check priority escalation to High or Urgent
      if (newPriority && (newPriority === 'High' || newPriority === 'Urgent') && newPriority !== ticket.priority) {
        emailService.sendSupportTicketEscalatedNotification({
          ticketId: ticket.ticket_number,
          companyName: ticket.company_name,
          adminName: ticket.contact_name,
          subject: ticket.subject,
          newPriority,
          ticketUrl: `${frontendUrl}/super-admin/support`
        }).catch(err => console.error(`[Email Error]: ${err.message}`));
      }

      return { success: true, message: isInternal ? 'Internal note added.' : 'Reply sent successfully.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update Ticket Status
   */
  async updateStatus(ticketId, status) {
    await db.query(`UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ? OR ticket_number = ?`, [status, ticketId, ticketId]);
    return { success: true, status };
  }
}

module.exports = new SupportTicketService();
