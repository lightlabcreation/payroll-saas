
const db = require('../config/mysql');

async function seedSubscription() {
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Get first employer (company)
            const [companies] = await connection.query("SELECT id FROM companies LIMIT 1");
            if (companies.length === 0) {
                console.log("No companies found. Cannot seed.");
                await connection.rollback();
                return;
            }
            const employerId = companies[0].id;

            // 2. Get first plan
            const [plans] = await connection.query("SELECT id FROM plans LIMIT 1");
            if (plans.length === 0) {
                console.log("No plans found. Cannot seed.");
                await connection.rollback();
                return;
            }
            const planId = plans[0].id;

            // 3. Create Active Subscription
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 12); // 1 year plan

            await connection.query(
                `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', 1, NOW(), NOW())`,
                [employerId, planId, startDate, endDate]
            );

            // 4. Create Expired Subscription (for variety)
            const pastStartDate = new Date();
            pastStartDate.setFullYear(pastStartDate.getFullYear() - 2);
            const pastEndDate = new Date();
            pastEndDate.setFullYear(pastEndDate.getFullYear() - 1);

            await connection.query(
                `INSERT INTO subscriptions (employer_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'expired', 0, NOW(), NOW())`,
                [employerId, planId, pastStartDate, pastEndDate]
            );

            await connection.commit();
            console.log(`Seeded ACTIVE and EXPIRED subscriptions for Employer ${employerId}`);

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

seedSubscription();
