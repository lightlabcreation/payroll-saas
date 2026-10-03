const whatsappService = require('../services/whatsapp.service');

const getTenantId = (req) => {
  return req.user?.company_id || req.employer?.id || req.user?.id || 1;
};

/**
 * Get WhatsApp Connectivity Status
 */
exports.getStatus = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;
    const statusData = await whatsappService.getStatus(tenantId, userId);

    return res.json({
      success: true,
      data: statusData,
    });
  } catch (error) {
    console.error('[WhatsAppController] getStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve WhatsApp status.',
      error: error.message,
    });
  }
};

/**
 * Connect WhatsApp (generates QR code)
 */
exports.connect = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;
    const { phoneNumber } = req.body;

    const phoneToUse = phoneNumber || req.user?.phone || '';

    const statusData = await whatsappService.startConnection(tenantId, userId, phoneToUse);

    return res.json({
      success: true,
      message: 'WhatsApp connection initiated.',
      data: statusData,
    });
  } catch (error) {
    console.error('[WhatsAppController] connect error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to start WhatsApp connection.',
    });
  }
};

/**
 * Get WhatsApp Pairing Code (Link with phone number without QR)
 */
exports.getPairingCode = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid WhatsApp phone number with country code (e.g. 918305810941)',
      });
    }

    const data = await whatsappService.requestPairingCode(tenantId, userId, phoneNumber);

    return res.json({
      success: true,
      message: 'Pairing code generated successfully.',
      data,
    });
  } catch (error) {
    console.error('[WhatsAppController] getPairingCode error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate pairing code.',
    });
  }
};

/**
 * Disconnect WhatsApp
 */
exports.disconnect = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = req.user?.id;

    const result = await whatsappService.disconnect(tenantId, userId);

    return res.json({
      success: true,
      message: 'WhatsApp session disconnected successfully.',
      data: result,
    });
  } catch (error) {
    console.error('[WhatsAppController] disconnect error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to disconnect WhatsApp session.',
      error: error.message,
    });
  }
};

/**
 * Update Notification Preferences
 */
exports.updatePreferences = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { autoSendPayslip, autoSendAttendance, autoSendAlerts } = req.body;

    await whatsappService.updatePreferences(tenantId, {
      autoSendPayslip,
      autoSendAttendance,
      autoSendAlerts,
    });

    return res.json({
      success: true,
      message: 'WhatsApp notification preferences saved successfully.',
    });
  } catch (error) {
    console.error('[WhatsAppController] updatePreferences error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update preferences.',
      error: error.message,
    });
  }
};

/**
 * Send Test WhatsApp Message
 */
exports.sendTestMessage = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { recipientPhone, message, recipientName, recipientRole } = req.body;

    const phone = recipientPhone || req.user?.phone;
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid recipient phone number.',
      });
    }

    const testMsg = message || `🧪 *KIAAN TECHNOLOGY - TEST MESSAGE*\n\nWhatsApp integration is active and operating normally.\n\nTimestamp: ${new Date().toLocaleString('en-IN')}`;

    const result = await whatsappService.sendWhatsAppMessage({
      tenantId,
      toPhone: phone,
      message: testMsg,
      eventType: 'ANNOUNCEMENT_MESSAGE',
      recipientName: recipientName || 'Employee',
      recipientRole: recipientRole || 'EMPLOYEE'
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to dispatch WhatsApp message. Please ensure WhatsApp is connected.',
        details: result
      });
    }

    return res.json({
      success: true,
      message: 'Test message dispatched successfully on WhatsApp.',
      data: result
    });
  } catch (error) {
    console.error('[WhatsAppController] sendTestMessage error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error sending test message.',
    });
  }
};

/**
 * Get Delivery Logs
 */
exports.getLogs = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const logs = await whatsappService.getLogs(tenantId, req.query.limit || 50);

    return res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('[WhatsAppController] getLogs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve WhatsApp delivery logs.',
      error: error.message,
    });
  }
};
