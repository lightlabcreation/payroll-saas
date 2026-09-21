const pool = require('./src/config/mysql');

const inspect = async () => {
    try {
        const [rows] = await pool.query('DESCRIBE users');
        console.log('USERS TABLE:', rows);
        const [rows2] = await pool.query('DESCRIBE admins');
        console.log('ADMINS TABLE:', rows2);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
inspect();
