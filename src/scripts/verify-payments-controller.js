
const db = require('../config/mysql');
const { generateTokens } = require('../utils/jwt');

async function testEndpoints() {
    try {
        // 1. Get a superadmin user to generate token
        const [admins] = await db.query("SELECT * FROM users WHERE role = 'superadmin' LIMIT 1");
        // If no superadmin, create a fake one or just use an admin/employer if role check allows, 
        // but payments route might be protected. The route file superadmin.routes.js says `authorize('superadmin')`.
        // I need a superadmin.

        let user = admins[0];
        if (!user) {
            // Create a temp superadmin if none exists (unlikely given context, but safe fallback)
            console.log('No superadmin found, Mocking one for token generation...');
            user = { id: 999, role: 'superadmin', email: 'test@admin.com' };
        }

        const tokens = generateTokens(user);
        const token = tokens.accessToken;

        console.log("Testing GET /api/superadmin/payments...");
        // We can't actually hit the running server from here easily as we are in a script execution environment 
        // that might not have network access to localhost:5000 if it's running in a different process/container.
        // However, I can simulate the controller call.

        // Actually, I can just call the controller function directly if I mock req/res. 
        // That's safer than relying on network.

        const superadminController = require('../controllers/superadmin.controller');

        // Mock Request/Response
        const req = { query: {}, user: { id: user.id, role: user.role } };
        const res = {
            json: (data) => {
                console.log("Controller Response (Success):", JSON.stringify(data, null, 2).substring(0, 200) + "...");
            },
            status: (code) => ({
                json: (data) => {
                    console.log(`Controller Response (Status ${code}):`, data);
                }
            })
        };
        const next = (err) => {
            console.error("Controller Error:", err);
        };

        await superadminController.getAllPayments(req, res, next);
        console.log("getAllPayments test finished.");

    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        process.exit();
    }
}

testEndpoints();
