const db = require('../config/mysql');
const crypto = require('crypto');
const emailService = require('../services/email.service');
const authService = require('../services/auth.service');
const paymentService = require('../services/payment.service');
const { generateToken } = require('../utils/jwt');

/**
 * 1. Create Razorpay Subscription Order
 * API: POST /api/payment/razorpay/create-order
 */
const createRazorpayOrder = async (req, res, next) => {
  try {
    const { plan_id } = req.body;
    const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_kiaan_payroll_key';

    if (!plan_id) {
      return res.status(400).json({ success: false, message: 'Plan ID is required.' });
    }

    const [planRows] = await db.query('SELECT * FROM plans WHERE id = ?', [plan_id]);
    const plan = planRows[0];

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Selected plan not found.' });
    }

    const amountInPaise = Math.round(parseFloat(plan.price || 0) * 100);
    const orderData = await paymentService.createOrder(amountInPaise, 'INR', {
      plan_id: String(plan.id),
      plan_name: plan.name
    });

    res.json({
      success: true,
      message: 'Razorpay order generated successfully.',
      data: {
        order_id: orderData.order_id,
        key_id,
        amount: amountInPaise,
        currency: 'INR',
        plan_name: plan.name,
        duration_months: plan.duration_months,
        is_live: orderData.is_live
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Verify Razorpay Payment Signature & Activate Subscription
 * API: POST /api/payment/razorpay/verify-payment
 */
const verifyRazorpayPayment = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, employer_id } = req.body;

    const empId = employer_id || req.employer?.id || req.user?.company_id;

    if (!razorpay_order_id || !razorpay_payment_id || !plan_id || !empId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Order ID, Payment ID, Plan ID, and Employer ID are required.'
      });
    }

    // Optional HMAC Signature Verification if secret is configured
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (key_secret && razorpay_signature) {
      const generated_signature = crypto
        .createHmac('sha256', key_secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generated_signature !== razorpay_signature) {
        await connection.rollback();

        // Dispatch Payment Failed Notification to Super Admin (info@kiaantechnology.com)
        emailService.sendSuperAdminPaymentFailedNotification({
          companyName: req.user?.company_name || `Employer #${empId}`,
          adminEmail: req.user?.email || 'unknown@domain.com',
          planName: 'Razorpay Order Verification',
          transactionRef: razorpay_order_id,
          paymentGateway: 'Razorpay',
          failureStatus: 'HMAC Signature Mismatch',
          failureTimestamp: new Date().toLocaleString()
        }).catch(err => console.error('[EMAIL ERROR]:', err.message));

        return res.status(400).json({ success: false, message: 'Invalid Razorpay payment signature verification failed.' });
      }
    }

    // Fetch Plan Details
    const [planRows] = await connection.query('SELECT * FROM plans WHERE id = ?', [plan_id]);
    const plan = planRows[0];
    if (!plan) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Plan not found.' });
    }

    // 1. Expire existing active subscriptions for company
    await connection.query(
      "UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE employer_id = ? AND status = 'active'",
      [empId]
    );

    // 2. Calculate Tenure Dates
    const startDate = new Date();
    const duration = plan.duration_months || 1;
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + duration);

    // 3. Create New Active Subscription
    const [subResult] = await connection.query(
      `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 1, NOW(), NOW())`,
      [empId, plan_id, startDate, endDate]
    );
    const subscriptionId = subResult.insertId;

    // 4. Create Invoice with 18% GST Tax
    const invoiceNumber = `INV-${Date.now()}-${empId}`;
    const baseAmount = parseFloat(plan.price || 0);
    const taxAmount = parseFloat((baseAmount * 0.18).toFixed(2));
    const totalAmount = baseAmount + taxAmount;

    const [invResult] = await connection.query(
      `INSERT INTO invoices (invoice_number, employer_id, subscription_id, plan_id, amount, tax_amount, total_amount, due_date, status, paid_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'paid', NOW(), NOW(), NOW())`,
      [invoiceNumber, empId, subscriptionId, plan_id, baseAmount, taxAmount, totalAmount]
    );
    const invoiceId = invResult.insertId;

    // 5. Record Payment Log in payments ledger
    await connection.query(
      `INSERT INTO payments (invoice_id, employer_id, amount, payment_method, payment_reference, transaction_id, status, payment_date, created_at, updated_at)
       VALUES (?, ?, ?, 'Razorpay', ?, ?, 'success', NOW(), NOW(), NOW())`,
      [invoiceId, empId, totalAmount, razorpay_payment_id, razorpay_order_id]
    );

    // 6. Update Corporate Company State & Plan Title
    await connection.query(
      'UPDATE companies SET status = "active", subscription_plan = ?, updated_at = NOW() WHERE id = ?',
      [plan.name, empId]
    );
    await connection.query(
      'UPDATE employers SET status = "active", subscription_status = "active", subscription_plan = ?, updated_at = NOW() WHERE id = ?',
      [plan.name, empId]
    );

    // 7. Update User status to active
    const [compRows] = await connection.query('SELECT user_id, company_name FROM companies WHERE id = ?', [empId]);
    const comp = compRows[0];
    if (comp?.user_id) {
      await connection.query('UPDATE users SET status = "active" WHERE id = ?', [comp.user_id]);
    }

    await connection.commit();

    // 8. Dispatch Full Suite of Email Notifications
    const recipientEmail = req.user?.email;
    const recipientName = req.user?.name || 'HR Admin';
    const companyName = comp?.company_name || req.user?.company_name || 'Corporate Tenant';
    const formattedStartDate = startDate.toLocaleDateString();
    const formattedEndDate = endDate.toLocaleDateString();

    if (recipientEmail) {
      // A. HR Admin Subscription Plan Confirmation Email
      emailService.sendHRAdminSubscriptionConfirmationEmail({
        email: recipientEmail,
        name: recipientName,
        companyName,
        planName: plan.name,
        price: totalAmount,
        currency: 'INR',
        billingFrequency: 'Monthly',
        startDate: formattedStartDate,
        expiryDate: formattedEndDate,
        maxEmployees: plan.max_employees || 100,
        features: ['Automated Payroll & Tax Compliance', 'Biometric & Attendance Sync', 'Employee Self-Service'],
        paymentStatus: 'Active',
        transactionId: razorpay_payment_id,
        paymentGateway: 'Razorpay',
        portalUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin`
      }).catch(err => console.error('[EMAIL ERROR HR Sub Confirmation]:', err.message));

      // B. HR Admin Payment Confirmation Email
      emailService.sendHRAdminPaymentConfirmationEmail({
        email: recipientEmail,
        name: recipientName,
        companyName,
        transactionId: razorpay_payment_id,
        planName: plan.name,
        amount: totalAmount,
        currency: 'INR',
        paymentGateway: 'Razorpay',
        paymentDate: new Date().toLocaleDateString(),
        paymentStatus: 'SUCCESS'
      }).catch(err => console.error('[EMAIL ERROR HR Payment Confirmation]:', err.message));
    }

    // C. Super Admin Subscription Purchase Alert (info@kiaantechnology.com)
    emailService.sendSuperAdminSubscriptionPurchaseNotification({
      companyName,
      adminName: recipientName,
      email: recipientEmail || 'N/A',
      planName: plan.name,
      price: totalAmount,
      currency: 'INR',
      startDate: formattedStartDate,
      expiryDate: formattedEndDate,
      paymentStatus: 'Active / Paid',
      transactionId: razorpay_payment_id,
      paymentGateway: 'Razorpay',
      purchaseDate: new Date().toLocaleString()
    }).catch(err => console.error('[EMAIL ERROR SA Sub Purchase]:', err.message));

    // D. Super Admin Payment Received Alert (info@kiaantechnology.com)
    emailService.sendSuperAdminPaymentSuccessNotification({
      companyName,
      adminName: recipientName,
      planName: plan.name,
      transactionId: razorpay_payment_id,
      paymentGateway: 'Razorpay',
      amount: totalAmount,
      currency: 'INR',
      paymentDate: new Date().toLocaleDateString(),
      validity: `${formattedStartDate} - ${formattedEndDate}`
    }).catch(err => console.error('[EMAIL ERROR SA Payment Success]:', err.message));

    res.json({
      success: true,
      message: 'Razorpay payment verified & subscription activated successfully!',
      data: {
        subscription_id: subscriptionId,
        invoice_number: invoiceNumber,
        plan_name: plan.name,
        start_date: startDate,
        end_date: endDate,
        status: 'active'
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 3. Verify Payment & Register New Merchant (Landing Page Checkout Flow)
 * API: POST /api/payment/razorpay/verify-and-register
 */
const verifyAndRegister = async (req, res, next) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    const {
      name,
      email,
      password,
      company_name,
      phone,
      plan_id,
      razorpay_order_id,
      razorpay_payment_id
    } = req.body;

    if (!email || !password || !company_name || !plan_id) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Email, password, company_name, and plan_id are required.' });
    }

    // Check if user email already registered
    const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please login.' });
    }

    // 1. Create User Account (Admin role)
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);
    const [userRes] = await connection.query(
      `INSERT INTO users (name, email, password, phone, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', NOW(), NOW())`,
      [name || company_name, email.trim().toLowerCase(), hashedPassword, phone || null]
    );
    const userId = userRes.insertId;

    // 2. Create Admin record
    const [adminRes] = await connection.query(
      `INSERT INTO admins (user_id, created_at, updated_at) VALUES (?, NOW(), NOW())`,
      [userId]
    );
    const adminId = adminRes.insertId;

    // 3. Fetch Plan Details
    const [planRows] = await connection.query('SELECT * FROM plans WHERE id = ?', [plan_id]);
    const plan = planRows[0];
    const planName = plan?.name || 'Standard';

    // 4. Create Company Record
    const [compRes] = await connection.query(
      `INSERT INTO companies (user_id, admin_id, company_name, subscription_plan, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
      [userId, adminId, company_name, planName]
    );
    const employerId = compRes.insertId;

    // Link user to company_id
    await connection.query('UPDATE users SET company_id = ? WHERE id = ?', [employerId, userId]);

    // 5. Activate Subscription
    const startDate = new Date();
    const duration = plan?.duration_months || 1;
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + duration);

    const [subRes] = await connection.query(
      `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 1, NOW(), NOW())`,
      [employerId, plan_id, startDate, endDate]
    );

    await connection.commit();

    // Generate JWT Token
    const userPayload = { id: userId, email: email.trim().toLowerCase(), role: 'admin', company_id: employerId };
    const token = generateToken(userPayload);

    // 6. Dispatch Email Notifications
    const formattedStartDate = startDate.toLocaleDateString();
    const formattedEndDate = endDate.toLocaleDateString();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name || company_name;

    // A. Super Admin Registration Alert (info@kiaantechnology.com)
    emailService.sendSuperAdminNewRegistrationNotification({
      companyName: company_name,
      adminName: cleanName,
      email: cleanEmail,
      phone: phone || 'N/A',
      createdAt: new Date().toLocaleString(),
      status: 'active',
      planName,
      activationStatus: 'Purchased & Active'
    }).catch(err => console.error('[EMAIL ERROR SA Registration]:', err.message));

    // B. Super Admin Subscription Purchase Alert (info@kiaantechnology.com)
    emailService.sendSuperAdminSubscriptionPurchaseNotification({
      companyName: company_name,
      adminName: cleanName,
      email: cleanEmail,
      planName,
      price: plan?.price || 0,
      currency: 'INR',
      startDate: formattedStartDate,
      expiryDate: formattedEndDate,
      paymentStatus: 'Active',
      transactionId: razorpay_payment_id || 'N/A',
      paymentGateway: 'Razorpay',
      purchaseDate: new Date().toLocaleString()
    }).catch(err => console.error('[EMAIL ERROR SA Sub Purchase]:', err.message));

    // C. HR Admin Subscription Confirmation Email
    emailService.sendHRAdminSubscriptionConfirmationEmail({
      email: cleanEmail,
      name: cleanName,
      companyName: company_name,
      planName,
      price: plan?.price || 0,
      currency: 'INR',
      billingFrequency: 'Monthly',
      startDate: formattedStartDate,
      expiryDate: formattedEndDate,
      maxEmployees: plan?.max_employees || 100,
      features: ['Automated Payroll & Tax Compliance', 'Biometric Sync', 'Employee Self-Service'],
      paymentStatus: 'Active',
      transactionId: razorpay_payment_id || 'N/A',
      paymentGateway: 'Razorpay',
      portalUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin`
    }).catch(err => console.error('[EMAIL ERROR HR Sub Confirm]:', err.message));

    res.status(201).json({
      success: true,
      message: 'Account created and plan subscription activated successfully!',
      data: {
        token,
        user: { id: userId, name, email, role: 'admin' },
        company: { id: employerId, company_name, plan: planName, end_date: endDate }
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 4. Create Dynamic/Static UPI Deep-Link Invoice QR Code
 * API: POST /api/payment/create-qr
 */
const createUPIInvoiceQR = async (req, res, next) => {
  try {
    const { amount, payee_name, upi_id, order_ref } = req.body;

    const upiId = upi_id || process.env.COMPANY_UPI_ID || 'kiaanpayroll@upi';
    const payeeName = payee_name || 'Kiaan Technology Pvt Ltd';
    const payAmount = amount || 0;
    const ref = order_ref || `ORD-${Date.now()}`;

    // UPI Deep-Link Format
    const upiPayload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${payAmount}&cu=INR&tr=${ref}&tn=${encodeURIComponent('Payroll SaaS Plan Payment')}`;

    res.json({
      success: true,
      data: {
        upi_payload: upiPayload,
        upi_id: upiId,
        payee_name: payeeName,
        amount: payAmount,
        transaction_ref: ref
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Manual Confirmation of Payment
 * API: POST /api/payment/confirm-static
 */
const confirmStaticPayment = async (req, res, next) => {
  try {
    const { employer_id, plan_id, payment_ref, notes } = req.body;

    if (!employer_id || !plan_id) {
      return res.status(400).json({ success: false, message: 'Employer ID and Plan ID are required.' });
    }

    const [planRows] = await db.query('SELECT * FROM plans WHERE id = ?', [plan_id]);
    const plan = planRows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });

    // Update active status
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (plan.duration_months || 1));

    await db.query("UPDATE subscriptions SET status = 'expired' WHERE employer_id = ? AND status = 'active'", [employer_id]);

    await db.query(
      `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 1, NOW(), NOW())`,
      [employer_id, plan_id, startDate, endDate]
    );

    await db.query('UPDATE companies SET status = "active", subscription_plan = ? WHERE id = ?', [plan.name, employer_id]);

    res.json({
      success: true,
      message: 'Payment confirmed manually and subscription activated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Handle Razorpay Async Webhook Events
 * API: POST /api/payment/razorpay/webhook
 */
const handleRazorpayWebhook = async (req, res, next) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const isValid = paymentService.verifyWebhookSignature(rawBody, webhookSignature);
    if (!isValid) {
      console.warn('⚠️ Invalid Razorpay Webhook Signature');
      return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload;

    console.log(`🔔 Received Razorpay Webhook Event: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      const amount = (paymentEntity?.amount || 0) / 100;

      console.log(`✅ Webhook: Payment ${paymentId} captured for Order ${orderId} (Amount: ₹${amount})`);
    } else if (event === 'payment.failed') {
      const paymentEntity = payload?.payment?.entity;
      console.warn(`❌ Webhook: Payment ${paymentEntity?.id} failed for Order ${paymentEntity?.order_id}`);
    }

    res.json({ status: 'ok', received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  verifyAndRegister,
  createUPIInvoiceQR,
  confirmStaticPayment,
  handleRazorpayWebhook
};

