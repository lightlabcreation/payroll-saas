const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const db = require('../config/mysql');

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers;
try {
  const baileys = require('@whiskeysockets/baileys');
  makeWASocket = baileys.default || baileys.makeWASocket;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
  Browsers = baileys.Browsers;
} catch (err) {
  console.warn('[WhatsAppService] Baileys library could not be loaded:', err.message);
}

const SESSIONS_DIR = path.join(__dirname, '../../sessions/whatsapp');

// Ensure base session directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch (err) {
    console.error('[WhatsAppService] Error creating sessions directory:', err);
  }
}

class WhatsAppService {
  constructor() {
    this.activeSockets = new Map(); // tenantKey -> WASocket
    this.qrCodes = new Map();       // tenantKey -> Base64 Data URL
    this.pairingCodes = new Map();  // tenantKey -> 8-character string
    this.connectionStates = new Map(); // tenantKey -> string ('DISCONNECTED', 'CONNECTING', 'QR_READY', 'CONNECTED', etc.)
    this.reconnectTimers = new Map();
  }

  getTenantKey(tenantId) {
    return `tenant_${tenantId || 'global'}`;
  }

  getSessionDir(tenantId) {
    const tenantKey = this.getTenantKey(tenantId);
    return path.join(SESSIONS_DIR, tenantKey);
  }

  normalizePhoneNumber(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/[^\d]/g, '');
    if (!clean) return null;
    // If standard 10 digit Indian mobile without country code, prepend 91
    if (clean.length === 10) {
      clean = '91' + clean;
    }
    return clean;
  }

  /**
   * Get current connection status for tenant from DB and active memory
   */
  async getStatus(tenantId, userId) {
    try {
      const [rows] = await db.query(
        'SELECT * FROM whatsapp_connections WHERE tenant_id = ? LIMIT 1',
        [tenantId]
      );

      const tenantKey = this.getTenantKey(tenantId);
      const memoryState = this.connectionStates.get(tenantKey);
      const currentQr = this.qrCodes.get(tenantKey) || null;
      const currentPairingCode = this.pairingCodes.get(tenantKey) || null;

      if (!rows || rows.length === 0) {
        return {
          status: memoryState || 'DISCONNECTED',
          phoneNumber: null,
          connectedAt: null,
          lastSeenAt: null,
          qrCodeUrl: currentQr,
          pairingCode: currentPairingCode,
          autoSendPayslip: true,
          autoSendAttendance: true,
          autoSendAlerts: true,
        };
      }

      const connection = rows[0];
      const isDbConnected = connection && connection.status === 'CONNECTED';
      const isMemConnected = memoryState === 'CONNECTED';

      let effectiveStatus = 'DISCONNECTED';
      if (isMemConnected || isDbConnected) {
        effectiveStatus = 'CONNECTED';
      } else if (currentQr && (memoryState === 'QR_READY' || memoryState === 'CONNECTING' || connection.status === 'QR_READY')) {
        effectiveStatus = 'QR_READY';
      } else if (memoryState === 'CONNECTING') {
        effectiveStatus = currentQr ? 'QR_READY' : 'CONNECTING';
      } else {
        effectiveStatus = 'DISCONNECTED';
      }

      // If DB has orphaned status, sync it back to DISCONNECTED
      if (effectiveStatus === 'DISCONNECTED' && connection.status === 'QR_READY') {
        await db.query(
          'UPDATE whatsapp_connections SET status = "DISCONNECTED" WHERE tenant_id = ?',
          [tenantId]
        ).catch(() => {});
      }

      return {
        status: effectiveStatus,
        phoneNumber: connection.phone_number,
        connectedAt: connection.connected_at,
        lastSeenAt: connection.last_seen_at,
        qrCodeUrl: currentQr,
        pairingCode: currentPairingCode,
        autoSendPayslip: Boolean(connection.auto_send_payslip),
        autoSendAttendance: Boolean(connection.auto_send_attendance),
        autoSendAlerts: Boolean(connection.auto_send_alerts),
      };
    } catch (error) {
      console.error('[WhatsAppService] Error fetching status:', error);
      return {
        status: 'DISCONNECTED',
        phoneNumber: null,
        error: error.message,
      };
    }
  }

  /**
   * Request WhatsApp Pairing Code (8-character code without camera)
   */
  async requestPairingCode(tenantId, userId, rawPhone) {
    if (!makeWASocket || !useMultiFileAuthState) {
      throw new Error('WhatsApp module is initializing. Please try again shortly.');
    }

    const normalizedPhone = this.normalizePhoneNumber(rawPhone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      throw new Error('Please enter a valid WhatsApp mobile number with country code (e.g. 918305810941)');
    }

    const tenantKey = this.getTenantKey(tenantId);
    const sessionPath = this.getSessionDir(tenantId);

    // Clean session directory if starting fresh pairing code
    if (this.activeSockets.has(tenantKey)) {
      try {
        const oldSock = this.activeSockets.get(tenantKey);
        oldSock.ev.removeAllListeners();
        oldSock.end?.();
      } catch (e) {}
      this.activeSockets.delete(tenantKey);
    }
    this.qrCodes.delete(tenantKey);
    this.pairingCodes.delete(tenantKey);

    // Ensure session directory exists
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'silent' });
    const browserConfig = Browsers ? Browsers.windows('Desktop') : ['Windows', 'Desktop', '10.0.26200'];

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, logger) : state.keys
      },
      printQRInTerminal: false,
      logger,
      browser: browserConfig,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: false,
    });

    this.activeSockets.set(tenantKey, socket);
    this.connectionStates.set(tenantKey, 'CONNECTING');

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        this.qrCodes.delete(tenantKey);
        this.pairingCodes.delete(tenantKey);
        this.connectionStates.set(tenantKey, 'CONNECTED');

        const userJid = socket.user?.id || '';
        let connectedNumber = userJid.split(':')[0] || userJid.split('@')[0] || normalizedPhone;
        if (connectedNumber) connectedNumber = connectedNumber.replace(/[^\d]/g, '');

        await db.query(
          `UPDATE whatsapp_connections 
           SET status = 'CONNECTED', 
               phone_number = COALESCE(?, phone_number),
               connected_at = NOW(), 
               last_seen_at = NOW(),
               last_error = NULL,
               updated_at = NOW() 
           WHERE tenant_id = ?`,
          [connectedNumber, tenantId]
        );
        console.log(`[WhatsAppService] ✅ Tenant ${tenantId} WhatsApp CONNECTED via Pairing Code: ${connectedNumber}`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason?.loggedOut;
        if (isLoggedOut) {
          this.activeSockets.delete(tenantKey);
          this.pairingCodes.delete(tenantKey);
          this.connectionStates.set(tenantKey, 'DISCONNECTED');
        }
      }
    });

    // Wait a brief tick for socket registration, then request 8-character code
    await new Promise(r => setTimeout(r, 1500));
    const code = await socket.requestPairingCode(normalizedPhone);
    console.log(`[WhatsAppService] Generated Pairing Code for ${normalizedPhone}: ${code}`);
    this.pairingCodes.set(tenantKey, code);
    this.connectionStates.set(tenantKey, 'PAIRING_READY');

    return {
      status: 'PAIRING_READY',
      pairingCode: code,
      phoneNumber: normalizedPhone
    };
  }

  /**
   * Start WhatsApp Connection (generates QR code)
   */
  async startConnection(tenantId, userId, rawPhone, isReconnect = false) {
    if (!makeWASocket || !useMultiFileAuthState) {
      throw new Error('WhatsApp module is initializing. Please try again shortly.');
    }

    const tenantKey = this.getTenantKey(tenantId);
    const sessionPath = this.getSessionDir(tenantId);

    // If socket already active and connected, return status
    if (this.activeSockets.has(tenantKey) && this.connectionStates.get(tenantKey) === 'CONNECTED') {
      return this.getStatus(tenantId, userId);
    }

    // Cleanup any existing reconnect timers
    if (this.reconnectTimers.has(tenantKey)) {
      clearTimeout(this.reconnectTimers.get(tenantKey));
      this.reconnectTimers.delete(tenantKey);
    }

    const normalizedPhone = this.normalizePhoneNumber(rawPhone);

    // If starting fresh pair request (not auto-reconnect), reset session folder
    if (!isReconnect) {
      this.qrCodes.delete(tenantKey);
      this.pairingCodes.delete(tenantKey);
      this.connectionStates.set(tenantKey, 'CONNECTING');

      try {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        fs.mkdirSync(sessionPath, { recursive: true });
      } catch (cleanErr) {
        console.error('[WhatsAppService] Error resetting session path:', cleanErr);
      }

      await db.query(
        `INSERT INTO whatsapp_connections 
          (tenant_id, user_id, phone_number, status, session_id, updated_at)
         VALUES (?, ?, ?, 'CONNECTING', ?, NOW())
         ON DUPLICATE KEY UPDATE 
          phone_number = VALUES(phone_number),
          status = 'CONNECTING',
          updated_at = NOW()`,
        [tenantId, userId, normalizedPhone, tenantKey]
      );
    } else {
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    let version = [2, 3000, 1043857760];
    try {
      if (fetchLatestBaileysVersion) {
        const v = await fetchLatestBaileysVersion();
        if (v && v.version) version = v.version;
      }
    } catch (e) {}

    const logger = pino({ level: 'silent' });
    const browserConfig = Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'];

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, logger) : state.keys
      },
      printQRInTerminal: true,
      logger,
      browser: browserConfig,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true
    });

    this.activeSockets.set(tenantKey, socket);

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            width: 320,
            margin: 3,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });

          this.qrCodes.set(tenantKey, qrDataUrl);
          this.connectionStates.set(tenantKey, 'QR_READY');

          await db.query(
            'UPDATE whatsapp_connections SET status = "QR_READY", updated_at = NOW() WHERE tenant_id = ?',
            [tenantId]
          );
          console.log(`[WhatsAppService] 📱 Fresh QR ready for tenant ${tenantId}`);
        } catch (qrErr) {
          console.error('[WhatsAppService] Error generating QR data URL:', qrErr);
        }
      }

      if (connection === 'open') {
        this.qrCodes.delete(tenantKey);
        this.pairingCodes.delete(tenantKey);
        this.connectionStates.set(tenantKey, 'CONNECTED');

        const userJid = socket.user?.id || '';
        let connectedNumber = userJid.split(':')[0] || userJid.split('@')[0] || normalizedPhone;
        if (connectedNumber) connectedNumber = connectedNumber.replace(/[^\d]/g, '');

        await db.query(
          `UPDATE whatsapp_connections 
           SET status = 'CONNECTED', 
               phone_number = COALESCE(?, phone_number),
               connected_at = NOW(), 
               last_seen_at = NOW(),
               last_error = NULL,
               updated_at = NOW() 
           WHERE tenant_id = ?`,
          [connectedNumber, tenantId]
        );
        console.log(`[WhatsAppService] ✅ Tenant ${tenantId} WhatsApp CONNECTED: ${connectedNumber}`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason?.loggedOut;
        const isRestart = statusCode === DisconnectReason?.restartRequired || statusCode === 515;
        const shouldReconnect = !isLoggedOut;

        console.log(`[WhatsAppService] Connection closed. StatusCode: ${statusCode} (Restart: ${isRestart}, LoggedOut: ${isLoggedOut})`);

        if (isLoggedOut) {
          this.activeSockets.delete(tenantKey);
          this.qrCodes.delete(tenantKey);
          this.pairingCodes.delete(tenantKey);
          this.connectionStates.set(tenantKey, 'DISCONNECTED');

          try {
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true, force: true });
            }
          } catch (cleanErr) {
            console.error('[WhatsAppService] Error cleaning session folder:', cleanErr);
          }

          await db.query(
            'UPDATE whatsapp_connections SET status = "DISCONNECTED", last_error = "Logged out from WhatsApp", updated_at = NOW() WHERE tenant_id = ?',
            [tenantId]
          );
        } else if (shouldReconnect) {
          // Immediately reconnect for status 515 / restartRequired after scanning QR
          const delay = isRestart ? 100 : 1500;
          this.connectionStates.set(tenantKey, 'CONNECTING');
          const timer = setTimeout(() => {
            this.startConnection(tenantId, userId, normalizedPhone, true).catch(err => {
              console.error('[WhatsAppService] Auto-reconnect failed:', err.message);
            });
          }, delay);
          this.reconnectTimers.set(tenantKey, timer);
        } else {
          this.activeSockets.delete(tenantKey);
          this.connectionStates.set(tenantKey, 'DISCONNECTED');
          await db.query(
            'UPDATE whatsapp_connections SET status = "DISCONNECTED", updated_at = NOW() WHERE tenant_id = ?',
            [tenantId]
          );
        }
      }
    });

    if (!isReconnect) {
      // Await until QR data URL is fully generated and cached in memory (up to 6s)
      await new Promise((resolve) => {
        let elapsed = 0;
        const checkInterval = setInterval(() => {
          elapsed += 100;
          if (this.qrCodes.has(tenantKey) || this.connectionStates.get(tenantKey) === 'CONNECTED' || elapsed >= 6000) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    return this.getStatus(tenantId, userId);
  }

  /**
   * Disconnect WhatsApp session
   */
  async disconnect(tenantId, userId) {
    const tenantKey = this.getTenantKey(tenantId);
    const sessionPath = this.getSessionDir(tenantId);

    if (this.reconnectTimers.has(tenantKey)) {
      clearTimeout(this.reconnectTimers.get(tenantKey));
      this.reconnectTimers.delete(tenantKey);
    }

    const socket = this.activeSockets.get(tenantKey);
    if (socket) {
      try {
        await socket.logout();
      } catch (err) {
        try {
          socket.end(new Error('Manual Disconnect'));
        } catch {}
      }
      this.activeSockets.delete(tenantKey);
    }

    this.qrCodes.delete(tenantKey);
    this.connectionStates.set(tenantKey, 'DISCONNECTED');

    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
    } catch (cleanErr) {
      console.error('[WhatsAppService] Error deleting session path on disconnect:', cleanErr);
    }

    await db.query(
      `UPDATE whatsapp_connections 
       SET status = 'DISCONNECTED', 
           last_seen_at = NOW(),
           updated_at = NOW() 
       WHERE tenant_id = ?`,
      [tenantId]
    );

    return { success: true, message: 'WhatsApp disconnected successfully' };
  }

  /**
   * Update Automated notification preferences
   */
  async updatePreferences(tenantId, { autoSendPayslip, autoSendAttendance, autoSendAlerts }) {
    await db.query(
      `UPDATE whatsapp_connections 
       SET auto_send_payslip = ?, 
           auto_send_attendance = ?, 
           auto_send_alerts = ?, 
           updated_at = NOW() 
       WHERE tenant_id = ?`,
      [
        autoSendPayslip !== undefined ? autoSendPayslip : true,
        autoSendAttendance !== undefined ? autoSendAttendance : true,
        autoSendAlerts !== undefined ? autoSendAlerts : true,
        tenantId
      ]
    );

    return { success: true, message: 'Preferences updated successfully' };
  }

  /**
   * Central Core WhatsApp Message Sender (Asynchronous & Safe)
   */
  async sendWhatsAppMessage({
    tenantId,
    toPhone,
    message,
    eventType = 'GENERAL',
    recipientName = '',
    recipientRole = 'EMPLOYEE'
  }) {
    if (!toPhone) {
      console.warn(`[WhatsAppService] Skipped: No phone number provided for ${recipientName || 'recipient'}`);
      return { success: false, status: 'SKIPPED', error: 'No phone number provided' };
    }

    const normalizedRecipient = this.normalizePhoneNumber(toPhone);
    if (!normalizedRecipient || normalizedRecipient.length < 10) {
      console.warn(`[WhatsAppService] Skipped: Invalid phone number (${toPhone})`);
      return { success: false, status: 'SKIPPED', error: 'Invalid phone format' };
    }

    const tenantKey = this.getTenantKey(tenantId);
    const socket = this.activeSockets.get(tenantKey);
    const isConnected = this.connectionStates.get(tenantKey) === 'CONNECTED' && socket;

    // Log attempt as QUEUED
    let logId = null;
    try {
      const [insertResult] = await db.query(
        `INSERT INTO whatsapp_logs 
          (tenant_id, recipient_phone, recipient_name, recipient_role, event_type, message_content, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [tenantId || null, normalizedRecipient, recipientName, recipientRole, eventType, message, isConnected ? 'SENDING' : 'SKIPPED']
      );
      logId = insertResult.insertId;
    } catch (dbErr) {
      console.error('[WhatsAppService] Error logging attempt:', dbErr);
    }

    if (!isConnected) {
      if (logId) {
        await db.query(
          'UPDATE whatsapp_logs SET status = "SKIPPED", error_message = "WhatsApp not connected for tenant" WHERE id = ?',
          [logId]
        );
      }
      return { success: false, status: 'SKIPPED', error: 'WhatsApp is not connected' };
    }

    // Dispatch Asynchronously
    try {
      const jid = `${normalizedRecipient}@s.whatsapp.net`;
      const result = await socket.sendMessage(jid, { text: message });

      const messageId = result?.key?.id || null;

      if (logId) {
        await db.query(
          'UPDATE whatsapp_logs SET status = "SENT", provider_message_id = ? WHERE id = ?',
          [messageId, logId]
        );
      }

      return { success: true, status: 'SENT', messageId };
    } catch (sendError) {
      console.error(`[WhatsAppService] Message send error to ${normalizedRecipient}:`, sendError.message);

      if (logId) {
        await db.query(
          'UPDATE whatsapp_logs SET status = "FAILED", error_message = ? WHERE id = ?',
          [sendError.message, logId]
        );
      }

      return { success: false, status: 'FAILED', error: sendError.message };
    }
  }

  /**
   * Helper: Send Attendance Notification to Employee
   */
  async sendAttendanceAlert({ tenantId, employeeName, employeePhone, date, time, status = 'Present' }) {
    try {
      // Check if auto_send_attendance is enabled
      const [rows] = await db.query(
        'SELECT auto_send_attendance FROM whatsapp_connections WHERE tenant_id = ? LIMIT 1',
        [tenantId]
      );
      if (rows.length && rows[0].auto_send_attendance === 0) {
        return; // Disabled in settings
      }

      const formattedDate = date || new Date().toISOString().split('T')[0];
      const formattedTime = time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const text = `🏢 *KIAAN TECHNOLOGY - ATTENDANCE ALERT*\n\n` +
        `Hello *${employeeName || 'Team Member'}*,\n\n` +
        `Your daily attendance punch has been registered successfully.\n\n` +
        `📅 *Date:* ${formattedDate}\n` +
        `⏰ *Time:* ${formattedTime}\n` +
        `📊 *Status:* ${status}\n\n` +
        `_Thank you for your dedication._\n` +
        `*Kiaan Technology Workforce & Payroll*`;

      return await this.sendWhatsAppMessage({
        tenantId,
        toPhone: employeePhone,
        message: text,
        eventType: 'ATTENDANCE_PUNCH',
        recipientName: employeeName,
        recipientRole: 'EMPLOYEE'
      });
    } catch (err) {
      console.error('[WhatsAppService] sendAttendanceAlert failed:', err.message);
    }
  }

  /**
   * Helper: Send Monthly Salary / Payslip Alert
   */
  async sendSalaryAlert({ tenantId, employeeName, employeePhone, month, year, amount, netSalary, payslipUrl }) {
    try {
      const [rows] = await db.query(
        'SELECT auto_send_payslip FROM whatsapp_connections WHERE tenant_id = ? LIMIT 1',
        [tenantId]
      );
      if (rows.length && rows[0].auto_send_payslip === 0) {
        return;
      }

      const salaryAmt = netSalary || amount || '0.00';
      const period = `${month || ''} ${year || new Date().getFullYear()}`.trim();

      const text = `💰 *KIAAN TECHNOLOGY - PAYSLIP ADVICE*\n\n` +
        `Hello *${employeeName || 'Team Member'}*,\n\n` +
        `Your payroll for *${period}* has been processed.\n\n` +
        `💵 *Net Disbursed Amount:* ₹${salaryAmt}\n` +
        `📄 *Status:* Paid / Processed\n\n` +
        (payslipUrl ? `🔗 *Download Payslip:* ${payslipUrl}\n\n` : '') +
        `Please login to your employee self-service portal for detailed break-up.\n\n` +
        `*Kiaan Technology Pvt Ltd*`;

      return await this.sendWhatsAppMessage({
        tenantId,
        toPhone: employeePhone,
        message: text,
        eventType: 'SALARY_DISBURSEMENT',
        recipientName: employeeName,
        recipientRole: 'EMPLOYEE'
      });
    } catch (err) {
      console.error('[WhatsAppService] sendSalaryAlert failed:', err.message);
    }
  }

  /**
   * Helper: Send Admin / Employer Alert
   */
  async sendAdminAlert({ tenantId, adminPhone, title, details }) {
    try {
      const text = `🔔 *KIAAN TECHNOLOGY - ADMIN ALERT*\n\n` +
        `📌 *${title || 'System Notification'}*\n\n` +
        `${details || ''}\n\n` +
        `📅 *Timestamp:* ${new Date().toLocaleString('en-IN')}\n\n` +
        `*Workforce Management System*`;

      return await this.sendWhatsAppMessage({
        tenantId,
        toPhone: adminPhone,
        message: text,
        eventType: 'ADMIN_ALERT',
        recipientName: 'Administrator',
        recipientRole: 'ADMIN'
      });
    } catch (err) {
      console.error('[WhatsAppService] sendAdminAlert failed:', err.message);
    }
  }

  /**
   * Fetch recent delivery logs for tenant
   */
  async getLogs(tenantId, limit = 50) {
    try {
      const [rows] = await db.query(
        `SELECT id, recipient_phone, recipient_name, recipient_role, event_type, status, error_message, created_at 
         FROM whatsapp_logs 
         WHERE tenant_id = ? OR tenant_id IS NULL
         ORDER BY id DESC LIMIT ?`,
        [tenantId, parseInt(limit, 10) || 50]
      );
      return rows;
    } catch (err) {
      console.error('[WhatsAppService] getLogs error:', err);
      return [];
    }
  }

  /**
   * Auto-restore active WhatsApp sessions on server startup
   */
  async initAllSessions() {
    try {
      const [rows] = await db.query(
        "SELECT tenant_id, user_id, phone_number FROM whatsapp_connections WHERE status = 'CONNECTED'"
      );
      for (const row of rows) {
        const sessionPath = this.getSessionDir(row.tenant_id);
        const credsFile = path.join(sessionPath, 'creds.json');
        if (fs.existsSync(credsFile)) {
          console.log(`[WhatsAppService] 🔄 Auto-restoring session for tenant ${row.tenant_id}...`);
          this.startConnection(row.tenant_id, row.user_id, row.phone_number, true).catch(e => {
            console.warn(`[WhatsAppService] Auto-restore notice for tenant ${row.tenant_id}:`, e.message);
          });
        }
      }
    } catch (err) {
      console.error('[WhatsAppService] Error restoring active sessions:', err.message);
    }
  }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;
