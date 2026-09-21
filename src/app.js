const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const errorHandler = require('./middlewares/error.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const superadminRoutes = require('./routes/superadmin.routes');
const adminRoutes = require('./routes/admin.routes');
const employerRoutes = require('./routes/employer.routes');
const employeeRoutes = require('./routes/employee.routes');
const publicRoutes = require('./routes/public.routes');
const vendorRoutes = require('./routes/vendor.routes');
const creditRoutes = require('./routes/credit.routes');
const jobseekerRoutes = require('./routes/jobseeker.routes');
const profileRoutes = require('./routes/profile.routes');
const paymentRoutes = require('./routes/payment.routes');


const app = express();
// Force restart timestamp: Request Refactor Complete

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = Array.isArray(env.cors.origin)
      ? env.cors.origin
      : [env.cors.origin];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Dev hack: allow all for now if errors persist
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/credits', creditRoutes); // Admin credit routes
app.use('/api/employer', employerRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/credits', creditRoutes); // Employer credit routes
app.use('/api/jobseeker', jobseekerRoutes);
app.use('/api/profile', profileRoutes);
const publicController = require('./controllers/public.controller');
app.post('/api/custom-plan-request', publicController.createCustomPlanRequest);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
