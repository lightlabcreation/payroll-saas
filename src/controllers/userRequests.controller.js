const pool = require('../config/mysql');

exports.createRequest = async (req, res) => {
    try {
        const { name, address, city, state, country, mobile, request_type } = req.body;

        if (!name || !address || !city || !state || !country || !mobile || !request_type) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const query = `
            INSERT INTO user_requests (name, address, city, state, country, mobile, request_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await pool.execute(query, [name, address, city, state, country, mobile, request_type]);

        res.status(201).json({
            success: true,
            message: 'Request submitted successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Error creating user request:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.getAllRequests = async (req, res) => {
    try {
        const query = 'SELECT * FROM user_requests ORDER BY created_at DESC';
        const [rows] = await pool.execute(query);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching user requests:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

exports.deleteRequest = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        console.log(`[UserRequests] Deleting request with ID: ${id} (Original param: ${req.params.id})`);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request ID'
            });
        }

        const query = 'DELETE FROM user_requests WHERE id = ?';

        // Using pool.query instead of execute for broader compatibility
        const [result] = await pool.query(query, [id]);

        if (result.affectedRows === 0) {
            console.warn(`[UserRequests] Request with ID ${id} not found for deletion.`);
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        console.log(`[UserRequests] Request with ID ${id} deleted successfully.`);
        res.status(200).json({
            success: true,
            message: 'Request deleted successfully'
        });
    } catch (error) {
        console.error('[UserRequests] Error deleting user request:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
