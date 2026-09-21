
const db = require('../config/mysql');

async function testQuery() {
    try {
        const query = `
      SELECT pay.*, 
             e.company_name, u.name as user_name, u.email as user_email,
             p.name as plan_name, p.price as plan_price
      FROM payments pay
      LEFT JOIN companies e ON pay.employer_id = e.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN invoices inv ON pay.invoice_id = inv.id
      LEFT JOIN plans p ON inv.plan_id = p.id
      ORDER BY pay.created_at DESC
    `;

        console.log('Running query...');
        const [rows] = await db.query(query);
        console.log('Query successful. Rows:', rows.length);
        console.log('First row:', rows[0]);
    } catch (error) {
        console.error('Query failed:', error);
    } finally {
        process.exit();
    }
}

testQuery();
