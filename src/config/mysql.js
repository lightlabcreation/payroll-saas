const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    port: parseInt(env.db.port, 10) || 3306,
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Table initialization removed from config to prevent locks
/*
const initDB = async () => { ... }
initDB();
*/

console.debug('[DB] MySQL Pool initialized for %s on %s', env.db.name, env.db.host);

module.exports = pool;
