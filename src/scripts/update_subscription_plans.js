require('dotenv').config();
const db = require('../config/mysql');

async function updateSubscriptionPlans() {
  console.log('=== UPDATING SAAS SUBSCRIPTION PLANS IN DATABASE ===\n');
  try {
    // 1. Fetch current plans
    const [currentPlans] = await db.query('SELECT * FROM plans');
    console.log('Current plans in DB:', currentPlans);

    // 2. Clear old plans or reset table to exact 5 plans
    // We will update or replace with exact 5 target plans
    const targetPlans = [
      {
        name: 'Free Trial',
        price: 0,
        duration_months: 1,
        description: '14-Day Free Trial for Payroll & HRMS SaaS',
        features: JSON.stringify([
          'Automated Salary Slips & Payroll Preview',
          'Biometric & Attendance Sync',
          'Employee Self-Service (ESS) Portal',
          'Standard Support'
        ]),
        max_employees: 10,
        max_jobs: 5,
        is_active: 1
      },
      {
        name: 'Basic',
        price: 999,
        duration_months: 1,
        description: 'Essential payroll management for small teams',
        features: JSON.stringify([
          'Automated Payroll & Salary Slip Generation',
          'PF, ESI & TDS Statutory Compliance Reports',
          'Biometric Attendance Integration',
          'Leave & Shift Management',
          'Standard Email Support'
        ]),
        max_employees: 25,
        max_jobs: 10,
        is_active: 1
      },
      {
        name: 'Professional',
        price: 1299,
        duration_months: 1,
        description: 'Best for growing companies & expanding workforce',
        features: JSON.stringify([
          'Everything in Basic Plan',
          'Advanced Tax & TDS Calculation Engine',
          'Multi-Department Payroll Processing',
          'Custom Allowance & Deduction Rule Builder',
          'Priority Email & WhatsApp Support'
        ]),
        max_employees: 100,
        max_jobs: 25,
        is_active: 1
      },
      {
        name: 'Premium',
        price: 1499,
        duration_months: 1,
        description: 'Complete automation for medium-large corporate entities',
        features: JSON.stringify([
          'Everything in Professional Plan',
          'Custom Salary Structure & CTC Breakup Builder',
          'Bank Transfer Batch Export (HDFC / ICICI / SBI / Axis)',
          'Detailed Audit Trail & Role-Based Access Control',
          'Dedicated Relationship Manager'
        ]),
        max_employees: 250,
        max_jobs: 50,
        is_active: 1
      },
      {
        name: 'Enterprise',
        price: 2999,
        duration_months: 1,
        description: 'Custom solutions for large enterprises & conglomerates',
        features: JSON.stringify([
          'Unlimited Employees & Multi-Tenant Entity Support',
          'Custom API Integrations & Webhook Subscriptions',
          'Custom ERP Sync (SAP / Tally / Oracle)',
          '24/7 SLA Priority Support & Dedicated Specialist',
          'Custom Compliance & Governance Workflows'
        ]),
        max_employees: 1000,
        max_jobs: 100,
        is_active: 1
      }
    ];

    // Disable foreign keys temporarily for clean reset
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('DELETE FROM plans');
    await db.query('ALTER TABLE plans AUTO_INCREMENT = 1');

    for (const p of targetPlans) {
      await db.query(
        `INSERT INTO plans (name, price, duration_months, description, features, max_employees, max_jobs, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [p.name, p.price, p.duration_months, p.description, p.features, p.max_employees, p.max_jobs, p.is_active]
      );
    }

    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    const [updatedPlans] = await db.query('SELECT * FROM plans');
    console.log('\n✅ Database updated successfully with 5 exact pricing plans:');
    updatedPlans.forEach(plan => {
      console.log(` - ID: ${plan.id} | ${plan.name} | ₹${plan.price} | Max Staff: ${plan.max_employees}`);
    });

  } catch (err) {
    console.error('❌ Failed to update plans:', err);
  } finally {
    process.exit(0);
  }
}

updateSubscriptionPlans();
