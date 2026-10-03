require('dotenv').config();
const https = require('https');

const key1 = process.env.BREVO_API_KEY_1 || "";
const key2 = process.env.BREVO_API_KEY_2 || "";

async function testKey(key, label) {
  const payload = JSON.stringify({
    sender: { name: 'Kiaan Technology Pvt Ltd', email: 'lightlabcreation@gmail.com' },
    to: [{ email: 'lightlabcreation@gmail.com', name: 'Test User' }],
    subject: 'OTP Test Verification',
    htmlContent: '<p>Your OTP is 123456</p>'
  });

  const options = {
    hostname: 'api.brevo.com',
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': key,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[${label}] Status: ${res.statusCode} | Response: ${body}`);
        resolve(res.statusCode === 201 || res.statusCode === 200);
      });
    });
    req.on('error', err => {
      console.error(`[${label}] Error:`, err.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

async function runTest() {
  console.log('Testing Key 1 (AF6wn1Nk4OaTbSzl)...');
  await testKey(key1, 'Key 1');
  
  console.log('\nTesting Key 2 (VxbbOUOAveecGegj)...');
  await testKey(key2, 'Key 2');
}

runTest();
