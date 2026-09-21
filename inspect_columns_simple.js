const pool = require('./src/config/mysql');

const inspect = async () => {
    try {
        const [rows] = await pool.query('SHOW COLUMNS FROM users');
        console.log('USERS COLUMNS:', rows.map(r => r.Field));
        const [rows2] = await pool.query('SHOW COLUMNS FROM admins');
        console.log('ADMINS COLUMNS:', rows2.map(r => r.Field));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
inspect();
