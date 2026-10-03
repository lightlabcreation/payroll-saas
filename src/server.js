// Load environment variables early to ensure DB credentials are available
require('dotenv').config();
const app = require('./app');
const db = require('./config/mysql');
const env = require('./config/env');

// Quick check to verify .env mappings
console.debug('[ENV] DB_HOST=%s DB_USER=%s DB_NAME=%s DB_PORT=%s', process.env.DB_HOST, process.env.DB_USER, process.env.DB_NAME, process.env.DB_PORT);

const PORT = parseInt(process.env.PORT || env.port || 5000, 10);
// Hot reload trigger: Baileys pairing & fast-reconnect 2026-10-01 15:56
const NODE_ENV = env.nodeEnv || env.node || 'development';

// Prevent duplicate server instances
let server = null;

/**
 * Start the server on the specified port
 * If port is busy, try alternative ports
 */
const startServer = (port, maxAttempts = 5) => {
  return new Promise((resolve, reject) => {
    // Prevent duplicate listen calls
    if (server && server.listening) {
      console.warn('⚠️  Server is already running.');
      return resolve(server);
    }

    server = app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
      console.log(`📝 Environment: ${NODE_ENV}`);
      console.log(`🌐 API Base URL: http://localhost:${port}/api`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`⚠️  Port ${port} is already in use.`);

        if (maxAttempts > 0) {
          const nextPort = port + 1;
          console.log(`🔄 Trying alternative port ${nextPort}...`);
          server.close();
          server = null;

          // Retry with next port
          setTimeout(() => {
            startServer(nextPort, maxAttempts - 1)
              .then(resolve)
              .catch(reject);
          }, 1000);
        } else {
          console.error(`❌ Failed to start server. All ports from ${PORT} to ${port} are busy.`);
          console.error('💡 Solutions:');
          console.error('   1. Stop the process using port ' + PORT);
          console.error('   2. Set PORT environment variable to a different port');
          console.error('   3. Kill process: netstat -ano | findstr :' + PORT);
          reject(error);
        }
      } else {
        console.error('❌ Server error:', error);
        reject(error);
      }
    });
  });
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close((err) => {
      if (err) {
        console.error('❌ Error during server shutdown:', err);
        process.exit(1);
      }

      console.log('✅ HTTP server closed.');

      // Close database connection
      db.end()
        .then(() => {
          console.log('✅ Database connection closed.');
          console.log('👋 Shutdown complete.');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Error closing database connection:', error);
          process.exit(1);
        });
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forcing shutdown after timeout...');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:');
  console.error('Error:', err);
  if (err && err.message) {
    console.error('Error message:', err.message);
  }
  if (err && err.stack) {
    console.error('Stack trace:', err.stack);
  }
  // Don't exit immediately in production, log and continue
  if (NODE_ENV === 'production') {
    console.error('⚠️  Continuing in production mode...');
  } else {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:');
  console.error('Error:', err);
  if (err && err.message) {
    console.error('Error message:', err.message);
  }
  if (err && err.stack) {
    console.error('Stack trace:', err.stack);
  }
  gracefulShutdown('uncaughtException');
});

// Initialize server
(async () => {
  // Attempt DB connection with retries but do not crash the server immediately on failure
  const maxAttempts = 5;
  const delayMs = 2000;

  const wait = (ms) => new Promise(res => setTimeout(res, ms));

  let connected = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔌 Attempting DB connection (attempt ${attempt}/${maxAttempts})...`);
      const connection = await db.getConnection();
      console.log('✅ Database connected successfully');
      connection.release();

      // Start Cron Jobs
      const startSubscriptionScheduler = require('./cron/subscription.cron');
      startSubscriptionScheduler();

      const startWeeklyBackupReportScheduler = require('./cron/weeklyBackupReport.cron');
      startWeeklyBackupReportScheduler();

      // Auto-restore active WhatsApp sessions
      const whatsappService = require('./services/whatsapp.service');
      whatsappService.initAllSessions().catch(() => {});

      connected = true;
      break;
    } catch (err) {
      console.error(`❌ DB connection attempt ${attempt} failed:`, err.message || err);
      if (attempt < maxAttempts) {
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await wait(delayMs);
      }
    }
  }

  if (!connected) {
    console.error('❌ Could not connect to the database after multiple attempts.');
    console.error('💡 Please verify MySQL is running and .env contains correct DB credentials.');
    // Do not exit - start server so APIs that don't need DB can respond and to surface runtime errors instead of startup crash
  }

  console.log(`[DEBUG] PORT value: ${PORT} (Type: ${typeof PORT})`);
  try {
    await startServer(PORT);
  } catch (serverErr) {
    console.error('❌ Failed to start server:', serverErr);
    process.exit(1);
  }
})();

