
const db = require('../config/mysql');

async function updateEmployeeSchema() {
    try {
        console.log('Checking employees table columns...');

        const [columns] = await db.query('DESCRIBE employees');
        const columnNames = columns.map(c => c.Field);

        if (!columnNames.includes('credit_balance')) {
            console.log('Adding credit_balance column...');
            await db.query("ALTER TABLE employees ADD COLUMN credit_balance DECIMAL(10,2) DEFAULT 0.00 AFTER salary");
        }

        console.log('Employees table schema updated.');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

updateEmployeeSchema();
