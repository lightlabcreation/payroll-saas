const db = require('../config/mysql');
const emailService = require('../services/email.service');

/**
 * Get All Jobs (Public)
 */
const getAllJobs = async (req, res, next) => {
  try {
    const { search, location, job_type, status, page = 1, limit = 10 } = req.query;

    let query = `
            SELECT j.*, 
                   COALESCE(c.company_name, e.company_name) as display_company_name, 
                   COALESCE(c.company_logo, e.company_logo) as display_company_logo
            FROM jobs j 
            LEFT JOIN employers e ON j.employer_id = e.id 
            LEFT JOIN companies c ON e.company_id = c.id
            WHERE 1=1
        `;
    const params = [];

    // Filter by Status (Default Active)
    query += ' AND j.status = ?';
    params.push(status || 'Active');

    if (search) {
      query += ' AND (j.title LIKE ? OR j.description LIKE ? OR j.skills LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (location) {
      query += ' AND j.location LIKE ?';
      params.push(`%${location}%`);
    }

    if (job_type) {
      query += ' AND j.job_type = ?';
      params.push(job_type);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Clone for count before adding order/limit
    const countSql = `SELECT COUNT(*) as count FROM (${query}) as t`;
    const [countResult] = await db.query(countSql, params);
    const total = countResult[0].count;

    query += ' ORDER BY j.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [jobs] = await db.query(query, params);

    // Format jobs
    const formattedJobs = jobs.map(job => ({
      ...job,
      employer: {
        id: job.employer_id,
        company_name: job.display_company_name,
        company_logo: job.display_company_logo
      }
    }));

    res.json({
      success: true,
      data: {
        jobs: formattedJobs,
        pagination: {
          total: total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) { next(error); }
};

/**
 * Get Single Job (Public)
 */
const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
            SELECT j.*, e.id as emp_id, 
                   COALESCE(c.company_name, e.company_name) as display_company_name, 
                   COALESCE(c.company_logo, e.company_logo) as display_company_logo, 
                   COALESCE(c.company_address, e.company_address) as display_company_address 
            FROM jobs j 
            LEFT JOIN employers e ON j.employer_id = e.id 
            LEFT JOIN companies c ON e.company_id = c.id
            WHERE j.id = ?
        `;
    const [rows] = await db.query(query, [id]);
    const job = rows[0];

    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    // Increment views count
    await db.query('UPDATE jobs SET views_count = views_count + 1 WHERE id = ?', [id]);

    // Format
    const formattedJob = {
      ...job,
      employer: {
        id: job.emp_id,
        company_name: job.display_company_name,
        company_logo: job.display_company_logo,
        company_address: job.display_company_address
      }
    };

    res.json({ success: true, data: formattedJob });
  } catch (error) { next(error); }
};

/**
 * Get Active Plans (Public)
 */
const getActivePlans = async (req, res, next) => {
  try {
    const [plans] = await db.query(`
            SELECT id, name, description, price, duration_months, max_employees, max_jobs, features 
            FROM plans 
            WHERE is_active = 1 
            ORDER BY price ASC
        `);
    const formattedPlans = plans.map(plan => {
      try {
        plan.features = typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []);
      } catch (e) {
        plan.features = [];
      }
      return plan;
    });
    res.json({ success: true, data: formattedPlans });
  } catch (error) { next(error); }
};

/**
 * Create Company Signup Request (Public)
 */
const createCompanyRequest = async (req, res, next) => {
  try {
    const { company_name, contact_name, email, phone, plan_id, company_address, gst_number, pan_number, notes } = req.body;

    if (!company_name || !contact_name || !email || !plan_id) {
      return res.status(400).json({ success: false, message: 'Required fields missing.' });
    }

    const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1', [plan_id]);
    if (planRows.length === 0) return res.status(404).json({ success: false, message: 'Plan not found.' });

    const [result] = await db.query(
      `INSERT INTO company_requests (company_name, contact_name, email, phone, plan_id, company_address, gst_number, pan_number, notes, payment_status, request_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', NOW(), NOW())`,
      [company_name, contact_name, email.toLowerCase(), phone || null, plan_id, company_address || null, gst_number || null, pan_number || null, notes || null]
    );

    // Trigger Brevo Welcome Email
    emailService.sendWelcomeEmail({
      email: email.toLowerCase(),
      name: contact_name,
      companyName: company_name,
      planName: planRows[0]?.name || 'SaaS Plan'
    }).catch(err => console.error('[BREVO] Error sending signup request email:', err.message));

    res.status(201).json({ success: true, message: 'Request submitted successfully.', data: { id: result.insertId } });
  } catch (error) { next(error); }
};

/**
 * Update Company Request Payment Status (Publicly called after payment success)
 */
const updateCompanyRequestPaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { payment_status, paypal_order_id } = req.body;

    if (payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Only paid status can be confirmed.' });
    }

    const [rows] = await db.query('SELECT * FROM company_requests WHERE id = ?', [id]);
    const companyRequest = rows[0];

    if (!companyRequest) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    if (companyRequest.payment_status === 'paid') {
      return res.json({ success: true, message: 'Payment already updated.', data: { id: companyRequest.id, payment_status: 'paid' } });
    }

    await db.query('UPDATE company_requests SET payment_status = ?, notes = ? WHERE id = ?', [
      'paid',
      paypal_order_id ? `${companyRequest.notes || ''} [PayPal: ${paypal_order_id}]`.trim() : companyRequest.notes,
      id
    ]);

    // Trigger Brevo Payment Receipt Email
    emailService.sendPaymentReceiptEmail({
      email: companyRequest.email,
      name: companyRequest.contact_name,
      planName: 'SaaS Subscription Plan',
      amount: 'Paid',
      transactionId: paypal_order_id || `REQ-${id}`
    }).catch(err => console.error('[BREVO] Error sending payment receipt email:', err.message));

    // If request was already accepted but payment was pending, try to activate subscription if company exists
    if (companyRequest.request_status === 'accepted' && companyRequest.created_company_id) {
      await db.query(
        'UPDATE subscriptions SET status = ? WHERE employer_id = ? AND status = ?',
        ['active', companyRequest.created_company_id, 'pending']
      );
      // Also update invoices if any
      await db.query(
        "UPDATE invoices SET status = 'paid' WHERE employer_id = ? AND status = 'pending' AND (plan_id = ? OR 1=1)",
        [companyRequest.created_company_id, companyRequest.plan_id]
      );
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully.',
      data: {
        id: companyRequest.id,
        payment_status: 'paid',
      },
    });
  } catch (error) { next(error); }
};

/**
 * Create User Request (Public)
 */
const createRequest = async (req, res, next) => {
  try {
    const { name, address, city, state, country, mobile, request_type } = req.body;

    if (!name || !address || !city || !state || !country || !mobile || !request_type) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Security: Block Admin Registration
    if (request_type === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin registration is restricted. Please contact support.'
      });
    }

    const query = `
            INSERT INTO user_requests (name, address, city, state, country, mobile, request_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

    const [result] = await db.query(query, [name, address, city, state, country, mobile, request_type]);

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully',
      data: { id: result.insertId }
    });
  } catch (error) { next(error); }
};

/**
 * Create Public Support Ticket (No Auth Required)
 */
const createPublicSupportTicket = async (req, res, next) => {
  try {
    const { name, email, category, priority, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message query are required.'
      });
    }

    const supportTicketService = require('../services/supportTicket.service');
    const ticket = await supportTicketService.createTicket({
      companyName: 'Public Website Visitor',
      contactName: name.trim(),
      contactEmail: email.trim(),
      subject: `[${category || 'General Query'}] Support request from ${name.trim()}`,
      category: category || 'Billing & Subscriptions',
      priority: priority || 'Normal',
      message: message.trim()
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully. Our team will contact you shortly.',
      data: ticket
    });
  } catch (error) { next(error); }
};

/**
 * Create Custom Plan Request (Public)
 * Endpoint: POST /api/custom-plan-request
 */
const createCustomPlanRequest = async (req, res, next) => {
  try {
    const { name, email, companyName, employeeCount, requirements } = req.body;

    // 1. Validation Check
    if (!name || !email || !companyName || !employeeCount || !requirements) {
      return res.status(400).json({
        success: false,
        message: 'All fields (Name, Email, Company Name, Total Employees, Requirements) are required.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    // 2. Database Logging
    const [result] = await db.query(
      `INSERT INTO custom_plan_requests (name, email, company_name, employee_count, requirements)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), companyName.trim(), employeeCount.trim(), requirements.trim()]
    );

    const createdAt = new Date();

    // 4. Email Notification Dispatch to support@kiaantechnology.com
    emailService.sendCustomPlanRequirementNotification({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      companyName: companyName.trim(),
      employeeCount: employeeCount.trim(),
      requirements: requirements.trim(),
      createdAt
    }).catch(err => console.error('❌ [Brevo Error] Custom plan email dispatch failed:', err.message));

    // 5. Frontend Confirmation
    res.status(201).json({
      success: true,
      message: 'Thank you! Your payroll customization request has been submitted. Our team will contact you soon.',
      data: {
        id: result.insertId
      }
    });
  } catch (error) {
    console.error('[CUSTOM_PLAN_REQUEST] Error:', error.message);
    next(error);
  }
};

/**
 * Get Privacy Policy Details (Public - Google Play Store & Web Compliance)
 */
const getPrivacyPolicy = async (req, res, next) => {
  try {
    const policyData = {
      appName: 'Kiaan Payroll & HRMS Software',
      companyName: 'Kiaan Technology Private Limited',
      officialWebsite: 'https://kiaantechnology.com/',
      supportEmail: 'support@kiaantechnology.com',
      contactEmail: 'info@kiaantechnology.com',
      phone: '+91 97521 00980',
      address: '2341/E, Sudama Nagar, Indore, Madhya Pradesh, India',
      effectiveDate: 'September 2026',
      lastUpdated: 'September 2026',
      jurisdiction: 'India (IT Act 2000, Digital Personal Data Protection Act DPDP 2023) & Global Data Protection (GDPR)',
      appPermissions: [
        {
          permission: 'Location (GPS / Coarse & Fine)',
          usage: 'Strictly for verifying geo-fenced employee attendance check-in and check-out. Location is not tracked continuously in background.'
        },
        {
          permission: 'Camera & Storage/Photos',
          usage: 'Used for taking punch-in selfie attendance verification, uploading profile pictures, and submitting reimbursement receipts and KYC documents.'
        },
        {
          permission: 'Push Notifications',
          usage: 'Delivering crucial alerts such as payslip generation, leave approval notifications, shift changes, and security updates.'
        },
        {
          permission: 'Network & Device State',
          usage: 'Verifying network connectivity (online/offline PWA sync) and fraud prevention.'
        }
      ],
      dataDeletionPolicy: {
        instructions: 'Users can request account and data deletion by sending an email from their registered email address to support@kiaantechnology.com or contacting their employer organization administrator. Requests are processed within 30 days.',
        retentionExceptions: 'Certain transaction records and payroll disbursement logs may be retained as mandated by Indian statutory tax and labor laws.'
      },
      grievanceOfficer: {
        name: 'Data Protection & Grievance Officer',
        company: 'Kiaan Technology Private Limited',
        email: 'support@kiaantechnology.com',
        phone: '+91 97521 00980',
        address: '2341/E, Sudama Nagar, Indore, Madhya Pradesh, India'
      }
    };

    res.json({
      success: true,
      data: policyData
    });
  } catch (error) {
    next(error);
  }
};

// Get How To Use Guides (Public endpoint for operating manuals)
const getHowToUseGuides = async (req, res, next) => {
  try {
    const { role } = req.query;
    
    const guides = {
      superadmin: {
        roleKey: 'superadmin',
        title: 'Super Admin Dashboard - How to Use Guide',
        subtitle: 'Comprehensive guide to managing multi-tenant companies, subscription plans, tenant onboarding, root administration, and database backups.',
        badge: 'SUPER ADMIN DASHBOARD',
        totalModules: 10
      },
      admin: {
        roleKey: 'admin',
        title: 'Company Admin Dashboard - How to Use Guide',
        subtitle: 'Step-by-step operating guide for managing employers, workforce attendance, credit wallet, WhatsApp broadcasts, and 1-click payroll.',
        badge: 'COMPANY ADMIN DASHBOARD',
        totalModules: 12
      },
      employer: {
        roleKey: 'employer',
        title: 'Employer Dashboard - How to Use Guide',
        subtitle: 'Operational guide for managing department staff, tracking daily attendance, assigning trainings, and executing 1-click salary payouts.',
        badge: 'EMPLOYER DASHBOARD',
        totalModules: 7
      },
      employee: {
        roleKey: 'employee',
        title: 'Employee Portal - How to Use Guide',
        subtitle: 'Personal guide for marking attendance, downloading payslips, accessing training modules, applying for leaves, and updating profile KYC.',
        badge: 'EMPLOYEE PORTAL',
        totalModules: 5
      },
      jobseeker: {
        roleKey: 'jobseeker',
        title: 'Job Seeker Portal - How to Use Guide',
        subtitle: 'Step-by-step guide for creating candidate profiles, uploading resumes, applying for verified jobs, and tracking applications.',
        badge: 'JOB SEEKER PORTAL',
        totalModules: 5
      },
      vendor: {
        roleKey: 'vendor',
        title: 'Vendor & Partner Portal - How to Use Guide',
        subtitle: 'Operational guide for submitting corporate invoices, tracking client payments, and managing active business contracts.',
        badge: 'VENDOR PORTAL',
        totalModules: 2
      }
    };

    let result = guides;
    if (role && guides[role.toLowerCase()]) {
      result = guides[role.toLowerCase()];
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllJobs,
  getJobById,
  getActivePlans,
  createCompanyRequest,
  updateCompanyRequestPaymentStatus,
  createRequest,
  createPublicSupportTicket,
  createCustomPlanRequest,
  getPrivacyPolicy,
  getHowToUseGuides
};
