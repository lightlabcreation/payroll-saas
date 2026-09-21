const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/mysql');

class ActivationService {
  /**
   * Generate secure single-use account activation / password setup token
   */
  async generatePasswordSetupToken(userId, email, expirationHours = 24) {
    const token = crypto.randomBytes(32).toString('hex');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    await db.query(
      `INSERT INTO password_setup_tokens (user_id, email, token, expires_at, used, created_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), 0, NOW())`,
      [userId, email, token, expirationHours]
    );

    const activationUrl = `${frontendUrl}/verify-reset?token=${token}`;
    return { token, activationUrl, expiresHours: expirationHours };
  }

  /**
   * Verify password setup token validity
   */
  async verifyPasswordSetupToken(token) {
    const [rows] = await db.query(
      `SELECT * FROM password_setup_tokens 
       WHERE token = ? AND used = 0 AND expires_at > NOW()`,
      [token]
    );

    if (rows.length === 0) {
      return { valid: false, message: 'Invalid or expired password setup token.' };
    }

    return { valid: true, tokenData: rows[0] };
  }

  /**
   * Set user password securely using token
   */
  async consumePasswordSetupToken(token, newPassword) {
    const { valid, tokenData, message } = await this.verifyPasswordSetupToken(token);
    if (!valid) {
      throw new Error(message);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 1. Update User Password & Status
    await db.query(
      `UPDATE users SET password = ?, status = 'active', updated_at = NOW() WHERE id = ?`,
      [hashedPassword, tokenData.user_id]
    );

    // 2. Mark token as used
    await db.query(
      `UPDATE password_setup_tokens SET used = 1 WHERE id = ?`,
      [tokenData.id]
    );

    const [[user]] = await db.query(
      `SELECT id, name, email, role, status FROM users WHERE id = ?`,
      [tokenData.user_id]
    );

    return user;
  }
}

module.exports = new ActivationService();
