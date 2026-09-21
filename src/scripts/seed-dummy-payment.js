
const db = require('../config/mysql');

async function seedPayment() {
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Get first employer
            const [employers] = await connection.query("SELECT id FROM companies LIMIT 1");
            if (employers.length === 0) {
                console.log("No companies found. Cannot seed.");
                await connection.rollback();
                return;
            }
            const employerId = employers[0].id;

            // 2. Get first plan
            const [plans] = await connection.query("SELECT id FROM plans LIMIT 1");
            if (plans.length === 0) {
                console.log("No plans found. Cannot seed.");
                await connection.rollback();
                return;
            }
            const planId = plans[0].id;

            // 3. Create Invoice
            const invoiceNumber = `INV-SEED-${Date.now()}`;
            const [invResult] = await connection.query(
                `INSERT INTO invoices (invoice_number, employer_id, plan_id, amount, tax_amount, total_amount, status, created_at, updated_at)
         VALUES (?, ?, ?, 1000.00, 180.00, 1180.00, 'paid', NOW(), NOW())`,
                [invoiceNumber, employerId, planId]
            );
            const invoiceId = invResult.insertId;

            // 4. Create Payment
            await connection.query(
                `INSERT INTO payments (invoice_id, employer_id, amount, payment_method, transaction_id, status, payment_date, created_at, updated_at)
         VALUES (?, ?, 1180.00, 'credit_card', 'TXN-SEED-12345', 'success', NOW(), NOW(), NOW())`,
                [invoiceId, employerId]
            );

            await connection.commit();
            console.log(`Seeded payment for Employer ${employerId}, Invoice ${invoiceId}`);

        } catch (err) {
            await connection.rollback();
            console.error(err);
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

seedPayment();
