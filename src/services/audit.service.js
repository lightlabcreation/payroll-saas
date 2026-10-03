/**
 * Audit Service
 * Handles activity logging, filtering, querying, and stats aggregation for Admin & SaaS Portals
 */

const db = require('../config/mysql');

class AuditService {
  /**
   * Log an activity to audit_logs table
   * @param {Object} params
   * @param {number|null} params.userId
   * @param {string} params.action
   * @param {string|Object} params.details
   * @param {string} [params.ipAddress]
   */
  async log({ userId = null, action, details, ipAddress = null }) {
    try {
      const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details ? String(details) : '');
      let clientIp = ipAddress ? String(ipAddress).substring(0, 45) : null;
      
      // Normalize localhost IP display
      if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') {
        clientIp = '127.0.0.1 (Local)';
      }

      const actionName = action ? String(action).toUpperCase() : 'UNKNOWN_ACTION';

      await db.query(
        `INSERT INTO audit_logs (user_id, action, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [userId || null, actionName, detailsStr, clientIp]
      );
    } catch (err) {
      console.error('[AUDIT_LOG_ERROR] Failed to save audit log:', err.message);
    }
  }

  /**
   * Get paginated audit logs with search and filters
   */
  async getAuditLogs({
    page = 1,
    limit = 20,
    search = '',
    action = '',
    startDate = '',
    endDate = '',
    userId = null,
    role = '',
    excludeSuperadmin = true
  } = {}) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let conditions = ['1=1'];
    let params = [];

    // Exclude superadmin logs for Admin view
    if (excludeSuperadmin) {
      conditions.push('(u.role IS NULL OR LOWER(u.role) != "superadmin")');
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(
        '(al.action LIKE ? OR al.details LIKE ? OR al.ip_address LIKE ? OR u.name LIKE ? OR u.email LIKE ?)'
      );
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (action && action.trim() && action !== 'ALL') {
      conditions.push('al.action = ?');
      params.push(action.trim().toUpperCase());
    }

    if (startDate && startDate.trim()) {
      conditions.push('al.created_at >= ?');
      params.push(`${startDate.trim()} 00:00:00`);
    }

    if (endDate && endDate.trim()) {
      conditions.push('al.created_at <= ?');
      params.push(`${endDate.trim()} 23:59:59`);
    }

    if (userId) {
      conditions.push('al.user_id = ?');
      params.push(parseInt(userId));
    }

    if (role && role.trim() && role !== 'ALL') {
      conditions.push('u.role = ?');
      params.push(role.trim().toLowerCase());
    }

    const whereClause = conditions.join(' AND ');

    // Query total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE ${whereClause}
    `;
    const [[{ total }]] = await db.query(countSql, params);

    // Query paginated rows
    const dataSql = `
      SELECT 
        al.id,
        al.user_id,
        al.action,
        al.details,
        al.ip_address,
        al.created_at,
        u.name as user_name,
        u.email as user_email,
        u.role as user_role,
        u.status as user_status
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE ${whereClause}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(dataSql, [...params, limitNum, offset]);

    const logsWithFormattedIp = rows.map(row => {
      let ip = row.ip_address;
      if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1 (Local)';
      }
      return { ...row, ip_address: ip };
    });

    return {
      logs: logsWithFormattedIp,
      pagination: {
        total: parseInt(total) || 0,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil((parseInt(total) || 0) / limitNum) || 1
      }
    };
  }

  /**
   * Get aggregate statistics for Audit Logs Dashboard view
   */
  async getStats(excludeSuperadmin = true) {
    try {
      const joinClause = 'LEFT JOIN users u ON al.user_id = u.id';
      const roleFilter = excludeSuperadmin ? 'AND (u.role IS NULL OR LOWER(u.role) != "superadmin")' : '';
      const baseWhere = excludeSuperadmin ? 'WHERE (u.role IS NULL OR LOWER(u.role) != "superadmin")' : '';

      // Total logs count
      const [[{ totalLogs }]] = await db.query(
        `SELECT COUNT(*) as totalLogs FROM audit_logs al ${joinClause} ${baseWhere}`
      );

      // Logs created today
      const [[{ todayLogs }]] = await db.query(
        `SELECT COUNT(*) as todayLogs 
         FROM audit_logs al 
         ${joinClause} 
         WHERE DATE(al.created_at) = CURDATE() ${roleFilter}`
      );

      // Unique active users involved in logs
      const [[{ uniqueUsers }]] = await db.query(
        `SELECT COUNT(DISTINCT al.user_id) as uniqueUsers 
         FROM audit_logs al 
         ${joinClause} 
         WHERE al.user_id IS NOT NULL ${roleFilter}`
      );

      // Security sensitive actions count
      const [[{ securityActions }]] = await db.query(
        `SELECT COUNT(*) as securityActions 
         FROM audit_logs al 
         ${joinClause} 
         WHERE (al.action LIKE '%PASSWORD%' 
            OR al.action LIKE '%DELETE%' 
            OR al.action LIKE '%RESET%' 
            OR al.action LIKE '%BLOCK%' 
            OR al.action LIKE '%STATUS%'
            OR al.action LIKE '%LOGIN%') ${roleFilter}`
      );

      // Top 5 most frequent actions
      const [topActions] = await db.query(
        `SELECT al.action, COUNT(*) as count 
         FROM audit_logs al 
         ${joinClause} 
         ${baseWhere}
         GROUP BY al.action 
         ORDER BY count DESC 
         LIMIT 5`
      );

      return {
        totalLogs: parseInt(totalLogs) || 0,
        todayLogs: parseInt(todayLogs) || 0,
        uniqueUsers: parseInt(uniqueUsers) || 0,
        securityActions: parseInt(securityActions) || 0,
        topActions: topActions || []
      };
    } catch (err) {
      console.error('[AUDIT_STATS_ERROR]', err.message);
      return {
        totalLogs: 0,
        todayLogs: 0,
        uniqueUsers: 0,
        securityActions: 0,
        topActions: []
      };
    }
  }

  /**
   * Get list of all distinct actions in the audit_logs table for filtering
   */
  async getUniqueActions(excludeSuperadmin = true) {
    try {
      const sql = excludeSuperadmin
        ? `SELECT DISTINCT al.action 
           FROM audit_logs al 
           LEFT JOIN users u ON al.user_id = u.id 
           WHERE al.action IS NOT NULL AND al.action != "" AND (u.role IS NULL OR LOWER(u.role) != "superadmin") 
           ORDER BY al.action ASC`
        : `SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL AND action != "" ORDER BY action ASC`;

      const [rows] = await db.query(sql);
      return rows.map(r => r.action);
    } catch (err) {
      console.error('[AUDIT_ACTIONS_ERROR]', err.message);
      return [];
    }
  }
}

module.exports = new AuditService();
