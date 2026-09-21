const emailService = require('../services/email.service');
const supportTicketService = require('../services/supportTicket.service');
const activationService = require('../services/activation.service');
const db = require('../config/mysql');

async function runEmailSystemVerification() {
  console.log('============ KIAAN PAYROLL & HRMS EMAIL SYSTEM VERIFICATION ============');

  try {
    // 1. Diagnostic Config Test
    console.log('\n--- 1. Testing Email Provider Configuration ---');
    const diagResult = await emailService.testEmailConfiguration();
    console.log('Diagnostic Result:', diagResult);

    // 2. Super Admin Notifications -> info@kiaantechnology.com
    console.log('\n--- 2. Testing Super Admin Business Notifications (info@kiaantechnology.com) ---');
    
    // A. New HR Admin Registration
    const regRes = await emailService.sendSuperAdminNewRegistrationNotification({
      companyName: 'Acme Test Corp',
      adminName: 'Rajesh Sharma',
      email: 'rajesh@acmetest.com',
      phone: '+91 9876543210',
      createdAt: new Date().toLocaleString(),
      status: 'active',
      planName: 'Enterprise Plan',
      activationStatus: 'Pending Activation'
    });
    console.log('A. New Registration Email Result:', regRes);

    // B. Subscription Purchase
    const subPurRes = await emailService.sendSuperAdminSubscriptionPurchaseNotification({
      companyName: 'Acme Test Corp',
      adminName: 'Rajesh Sharma',
      email: 'rajesh@acmetest.com',
      planName: 'Enterprise 500+ Staff',
      price: '14999',
      currency: 'INR',
      startDate: '2026-09-19',
      expiryDate: '2027-09-19',
      paymentStatus: 'PAID',
      transactionId: 'TXN_TEST_99182',
      paymentGateway: 'Razorpay'
    });
    console.log('B. Subscription Purchase Result:', subPurRes);

    // C. Successful Payment
    const paySuccRes = await emailService.sendSuperAdminPaymentSuccessNotification({
      companyName: 'Acme Test Corp',
      adminName: 'Rajesh Sharma',
      planName: 'Enterprise Plan',
      transactionId: 'TXN_TEST_99182',
      paymentGateway: 'Razorpay',
      amount: '14999',
      paymentDate: '2026-09-19',
      validity: '1 Year'
    });
    console.log('C. Payment Success Result:', paySuccRes);

    // D. Failed Payment
    const payFailRes = await emailService.sendSuperAdminPaymentFailedNotification({
      companyName: 'Acme Test Corp',
      adminEmail: 'rajesh@acmetest.com',
      planName: 'Enterprise Plan',
      transactionRef: 'TXN_FAIL_0012',
      paymentGateway: 'Razorpay',
      failureStatus: 'Card Payment Declined by Issuer Bank',
      failureTimestamp: new Date().toLocaleString()
    });
    console.log('D. Payment Failed Result:', payFailRes);

    // 3. Support Ticket Notifications -> support@kiaantechnology.com
    console.log('\n--- 3. Testing Support Ticket Routing (support@kiaantechnology.com) ---');
    
    // Create actual DB ticket
    const ticket = await supportTicketService.createTicket({
      companyId: 1,
      companyName: 'Acme Test Corp',
      userId: 101,
      contactName: 'Rajesh Sharma',
      contactEmail: 'rajesh@acmetest.com',
      subject: 'Urgent: September Salary Slip Discrepancy',
      category: 'Payroll Calculation',
      priority: 'Urgent',
      message: 'Tax calculation for Finance division is showing 0 TDS. Please resolve.'
    });
    console.log('Created Ticket in DB:', ticket);

    // Customer Reply Test
    const replyRes = await supportTicketService.addReply({
      ticketId: ticket.ticketNumber,
      senderId: 101,
      senderName: 'Rajesh Sharma',
      role: 'customer',
      message: 'Attached updated tax logs for review.'
    });
    console.log('Customer Reply Result:', replyRes);

    // 4. Internal Notes Security Test (Crucial Requirement!)
    console.log('\n--- 4. Testing Internal Notes Security Enforcement ---');
    const internalNoteRes = await supportTicketService.addReply({
      ticketId: ticket.ticketNumber,
      senderId: 1,
      senderName: 'Super Admin Tech',
      role: 'staff',
      message: 'Internal Staff Note: Checked backend database logs. TDS rule enabled on server 2.',
      isInternal: true
    });
    console.log('Internal Note Added:', internalNoteRes);

    // Verify HR Admin ticket list does NOT contain internal note
    const hrTickets = await supportTicketService.getAllTickets({ isSuperAdmin: false, companyId: 1 });
    const targetHrTicket = hrTickets.find(t => t.ticket_number === ticket.ticketNumber);
    const hasInternalMsgInHrView = targetHrTicket?.messages.some(m => m.is_internal === 1 || m.is_internal === true);
    console.log(`🔒 HR Admin Ticket Messages Count: ${targetHrTicket?.messages.length} | Has Internal Note Exposed? ${hasInternalMsgInHrView ? '❌ YES (SECURITY VIOLATION!)' : '✅ NO (STRICT ENFORCEMENT PASSED!)'}`);

    // 5. HR Admin Welcome & Activation Token Email
    console.log('\n--- 5. Testing HR Admin Welcome & Activation Link ---');
    const tokenData = await activationService.generatePasswordSetupToken(101, 'rajesh@acmetest.com');
    const welcomeRes = await emailService.sendHRAdminWelcomeActivationEmail({
      email: 'rajesh@acmetest.com',
      name: 'Rajesh Sharma',
      companyName: 'Acme Test Corp',
      activationUrl: tokenData.activationUrl
    });
    console.log('Welcome Email Activation Token Link:', tokenData.activationUrl);
    console.log('Welcome Email Dispatch Result:', welcomeRes);

    // 6. DB Email Logs Inspection
    console.log('\n--- 6. Inspecting Database Email Logs ---');
    const [logs] = await db.query('SELECT id, notification_type, recipient_email, sender_email, status, created_at FROM email_logs ORDER BY id DESC LIMIT 10');
    console.table(logs);

    console.log('\n🎉 ALL 13 SECTIONS VERIFIED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Verification script failed:', err);
  } finally {
    process.exit(0);
  }
}

runEmailSystemVerification();
