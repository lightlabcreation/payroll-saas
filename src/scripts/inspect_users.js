const mysql = require('../config/mysql');

const inspect = async () => {
    try {
        const connection = await mysql.getConnection();
        const [users] = await connection.query('SELECT id, name, email, role FROM users LIMIT 10');
        console.log('Users:', users);
        connection.release();
    } catch (e) { console.error(e); }
    process.exit();
};

inspect();
