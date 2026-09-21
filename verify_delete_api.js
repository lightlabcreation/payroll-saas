const pool = require('./src/config/mysql');

const testDelete = async () => {
    try {
        console.log('1. Creating dummy user request directly in DB...');
        const [res] = await pool.query(`INSERT INTO user_requests (name, address, city, state, country, mobile, request_type) VALUES ('Delete Test', 'Addr', 'City', 'State', 'Country', '0000000000', 'test')`);
        const id = res.insertId;
        console.log(`   Created request with ID: ${id}`);

        console.log('2. Logging in as SuperAdmin to get token...');
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'superadmin@example.com', password: 'password123' })
        });

        if (!loginRes.ok) throw new Error(`Login failed with status ${loginRes.status}`);
        const loginData = await loginRes.json();
        const token = loginData.data.accessToken;
        console.log('   Logged in.');

        console.log(`3. Sending DELETE request to /api/superadmin/user-requests/${id}...`);
        const delRes = await fetch(`http://localhost:5000/api/superadmin/user-requests/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('   Response Status:', delRes.status);
        const delData = await delRes.json();
        console.log('   Response Data:', delData);

        if (delRes.status === 200 && delData.success) {
            console.log('SUCCESS: Delete API is working!');
        } else {
            console.log('FAILED: Delete API returned unexpected response.');
        }

    } catch (error) {
        console.error('ERROR:', error);
    } finally {
        process.exit();
    }
};

testDelete();
