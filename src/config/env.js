require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  // Backward compatible keys (some files use nodeEnv)
  nodeEnv: process.env.NODE_ENV || 'development',
  node: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    name: process.env.DB_NAME || 'pop_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your_super_secret_jwt_key',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '24h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSize: process.env.MAX_FILE_SIZE || 5242880, // 5MB
  },

  cors: {
    origin: process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
      : ['http://localhost:5173', 'http://localhost:5174'],
  },
};
