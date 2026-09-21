const pool = require('./src/config/mysql');

const listColumns = async () => {
    try {
        const [rows] = await pool.query('SHOW COLUMNS FROM user_requests');
        console.log('COLUMNS:', rows.map(r => r.Field));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
listColumns();
