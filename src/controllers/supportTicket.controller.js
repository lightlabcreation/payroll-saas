const supportTicketService = require('../services/supportTicket.service');
const emailService = require('../services/email.service');
const db = require('../config/mysql');

/**
 * Support Ticket Controller
 */
const getAllTickets = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';
    const { status, priority, search } = req.query;

    const tickets = await supportTicketService.getAllTickets({
      isSuperAdmin,
      userId: req.user.id,
      companyId: req.user.company_id,
      status,
      priority,
      search
    });

    res.json({
      success: true,
      count: tickets.length,
      data: tickets
    });
  } catch (error) {
    next(error);
  }
};

const createTicket = async (req, res, next) => {
  try {
    const { companyName, contactName, contactEmail, subject, category, priority, message, attachmentUrl } = req.body;

    let finalAttachmentUrl = attachmentUrl || null;
    if (req.file) {
      finalAttachmentUrl = `/uploads/${req.file.filename}`;
    }

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Ticket subject and message content are required.'
      });
    }

    const ticket = await supportTicketService.createTicket({
      companyId: req.user.company_id || null,
      companyName: companyName || req.user.company_name || 'Corporate Account',
      userId: req.user.id,
      contactName: contactName || req.user.name,
      contactEmail: contactEmail || req.user.email,
      subject,
      category,
      priority,
      message,
      attachmentUrl: finalAttachmentUrl
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully.',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

const addReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, isInternal, newPriority } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message body cannot be empty.'
      });
    }

    const role = (req.user.role === 'superadmin' || req.user.role === 'admin') ? 'staff' : 'customer';

    const result = await supportTicketService.addReply({
      ticketId: id,
      senderId: req.user.id,
      senderName: req.user.name || 'Support Desk',
      role,
      message: message.trim(),
      isInternal: role === 'staff' ? Boolean(isInternal) : false,
      newPriority
    });

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

const updateTicketStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
    }

    const result = await supportTicketService.updateStatus(id, status);
    res.json({
      success: true,
      message: `Ticket status updated to ${status}.`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Section 11: Email Notification Logs API
 */
const getEmailLogs = async (req, res, next) => {
  try {
    const { type, recipient, status, limit = 50, offset = 0 } = req.query;

    let sql = `SELECT * FROM email_logs WHERE 1=1`;
    const params = [];

    if (type) {
      sql += ` AND notification_type = ?`;
      params.push(type);
    }
    if (recipient) {
      sql += ` AND recipient_email LIKE ?`;
      params.push(`%${recipient}%`);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [logs] = await db.query(sql, params);
    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM email_logs`);

    res.json({
      success: true,
      total,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Section 2: Email Diagnostic Test Endpoint
 */
const testEmailConfig = async (req, res, next) => {
  try {
    const testResult = await emailService.testEmailConfiguration();
    res.json({
      success: testResult.success,
      message: testResult.success ? 'Email configuration test successful!' : 'Email test failed.',
      data: testResult
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTickets,
  createTicket,
  addReply,
  updateTicketStatus,
  getEmailLogs,
  testEmailConfig
};
