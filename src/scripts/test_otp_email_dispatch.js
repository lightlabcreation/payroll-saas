require('dotenv').config();
const emailService = require('../services/email.service');

async function testOTPEmail() {
  console.log('=== TESTING PASSWORD RESET OTP EMAIL DISPATCH ===\n');
  console.log('BREVO API KEY present:', Boolean(process.env.BREVO_API_KEY));
  console.log('Sender Info Email:', emailService.infoEmail);
  console.log('Sender Support Email:', emailService.supportEmail);

  const res = await emailService.sendPasswordResetOTPEmail({
    email: 'lightlabcreation@gmail.com',
    name: 'Test Admin User',
    otp: '984512'
  });

  console.log('\nEmail Send Result:', res);
}

testOTPEmail();
