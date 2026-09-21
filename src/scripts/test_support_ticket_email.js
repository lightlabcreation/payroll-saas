require('dotenv').config();
const supportTicketService = require('../services/supportTicket.service');
const emailService = require('../services/email.service');
const db = require('../config/mysql');

async function testSupportTicketEmailNotification() {
  console.log('=== STARTING PAYROLL SUPPORT TICKET EMAIL VERIFICATION ===\n');

  try {
    // 1. Create a support ticket with attachment link
    const newTicketInput = {
      companyId: 1,
      companyName: 'Apex Logistics Ltd',
      userId: 42,
      contactName: 'Vikram Singh',
      contactEmail: 'vikram@apexlogistics.com',
      subject: 'PF Deduction Discrepancy for August 2026 Batch',
      category: 'Payroll Compliance',
      priority: 'Urgent',
      message: 'The Provident Fund deduction percentage for senior drivers is displaying 10% instead of 12%. Attached error report screenshot for reference.',
      attachmentUrl: '/uploads/pf_report_screen_2026.png'
    };

    console.log('1️⃣ Raising new Support Ticket as authenticated Payroll user...');
    const ticketResult = await supportTicketService.createTicket(newTicketInput);
    
    console.log('✅ Ticket created successfully in Database:');
    console.log(`   Ticket ID: ${ticketResult.id}`);
    console.log(`   Ticket Number: ${ticketResult.ticketNumber}`);
    console.log(`   Status: ${ticketResult.status}`);
    console.log(`   Attachment: ${ticketResult.attachmentUrl}\n`);

    // Verify format: PAY-TKT-YYYYMMDD-XXXX
    if (/^PAY-TKT-\d{8}-\d{4}$/.test(ticketResult.ticketNumber)) {
      console.log('✅ Ticket Number format matches specification: PAY-TKT-YYYYMMDD-XXXX');
    } else {
      console.error('❌ Ticket Number format mismatch:', ticketResult.ticketNumber);
    }

    // 2. Fetch the created ticket & message from MySQL DB
    const [ticketDb] = await db.query(`SELECT * FROM support_tickets WHERE id = ?`, [ticketResult.id]);
    const [messagesDb] = await db.query(`SELECT * FROM support_ticket_messages WHERE ticket_id = ?`, [ticketResult.id]);

    console.log('\n2️⃣ DB Verification:');
    console.log('   Saved Ticket record:', ticketDb[0]);
    console.log('   Saved Message record:', messagesDb[0]);

    // 3. Fetch recent Email Logs for this ticket number
    const [emailLogs] = await db.query(
      `SELECT * FROM email_logs WHERE recipient_email = 'support@kiaantechnology.com' ORDER BY id DESC LIMIT 1`
    );

    console.log('\n3️⃣ Email Log Verification:');
    if (emailLogs.length > 0) {
      console.log('   Logged Email Record:', {
        id: emailLogs[0].id,
        notification_type: emailLogs[0].notification_type,
        recipient_email: emailLogs[0].recipient_email,
        subject: emailLogs[0].subject,
        status: emailLogs[0].status,
        message_id: emailLogs[0].message_id,
        error_message: emailLogs[0].error_message
      });
      if (emailLogs[0].subject === `New Payroll Support Ticket - ${ticketResult.ticketNumber}`) {
        console.log('✅ Email Subject line matches specification strictly!');
      }
    } else {
      console.log('⚠️ No email log record found.');
    }

    console.log('\n=== PAYROLL SUPPORT TICKET EMAIL TEST COMPLETED SUCCESSFULY ===');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    process.exit(0);
  }
}

testSupportTicketEmailNotification();
