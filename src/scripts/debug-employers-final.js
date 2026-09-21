
const db = require('../config/mysql');

async function debugEmployers() {
    try {
        console.log('--- DEBUG EMPLOYERS ---');
        const [employers] = await db.query('SELECT * FROM employers');
        console.log(`Found ${employers.length} employers:`);
        employers.forEach(emp => {
            console.log(`[ID: ${emp.id}] Company ID: ${emp.company_id}, Name: ${emp.company_name}, Email: ${emp.email}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugEmployers();
