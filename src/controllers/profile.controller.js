const db = require('../config/mysql');
const bcrypt = require('bcrypt');
const { generateTokens } = require('../utils/jwt'); // In case we need to refresh token on profile change, though not requested
const { validationResult } = require('express-validator'); // If we use express-validator

/**
 * Get User Profile
 */
const getProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Fetch fetching generic user data
        const [users] = await db.query('SELECT id, name, email, phone, role FROM users WHERE id = ?', [userId]);
        const user = users[0];

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Return user profile
        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Update User Profile
 */
const updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { name, phone } = req.body;

        // Basic validation
        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        // Update user
        await db.query('UPDATE users SET name = ?, phone = ?, updated_at = NOW() WHERE id = ?', [name, phone || null, userId]);

        // Updated user for response
        const [users] = await db.query('SELECT id, name, email, phone, role FROM users WHERE id = ?', [userId]);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: users[0]
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Change Password
 */
const changePassword = async (req, res, next) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        // Get user for password verification
        const [users] = await connection.query('SELECT password FROM users WHERE id = ?', [userId]);
        const user = users[0];

        if (!user) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Incorrect current password' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await connection.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, userId]);

        await connection.commit();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        await connection.rollback();
        next(error);
    } finally {
        connection.release();
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword
};
