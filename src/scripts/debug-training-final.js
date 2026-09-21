
const db = require('../config/mysql');

async function debugTrainingSchema() {
    try {
        console.log('--- DEBUG TRAINING SCHEMA ---');

        try {
            const [tCols] = await db.query('DESCRIBE trainings');
            console.log('TRAININGS table columns:', tCols.map(c => c.Field));
        } catch (e) {
            console.log('TRAININGS table error:', e.message);
        }

        try {
            const [taCols] = await db.query('DESCRIBE training_assignments');
            console.log('TRAINING_ASSIGNMENTS table columns:', taCols.map(c => c.Field));
        } catch (e) {
            console.log('TRAINING_ASSIGNMENTS table error:', e.message);
        }

        try {
            const [tmCols] = await db.query('DESCRIBE training_materials');
            console.log('TRAINING_MATERIALS table columns:', tmCols.map(c => c.Field));
        } catch (e) {
            console.log('TRAINING_MATERIALS table error:', e.message);
        }

    } catch (error) {
        console.error('General Error:', error);
    } finally {
        process.exit();
    }
}

debugTrainingSchema();
