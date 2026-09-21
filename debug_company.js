
const db = require('./src/config/mysql');

async function debugData() {
    try {
        console.log("Fetching Companies...");
        const [companies] = await db.query("SELECT * FROM companies");
        console.log(`Found ${companies.length} companies.`);

        for (const c of companies) {
            console.log(`\nCompany: ID=${c.id}, Name=${c.company_name}, UserID=${c.user_id}, AdminID=${c.admin_id}`);

            // Check User
            if (c.user_id) {
                const [u] = await db.query("SELECT * FROM users WHERE id = ?", [c.user_id]);
                if (u.length) console.log(`  -> Linked User: ID=${u[0].id}, Email=${u[0].email}, Role=${u[0].role}`);
                else console.log(`  -> Linked User: NOT FOUND (ID ${c.user_id})`);
            } else {
                console.log(`  -> Linked User: ID is NULL`);
            }

            // Check Admin
            if (c.admin_id) {
                const [a] = await db.query("SELECT * FROM admins WHERE id = ?", [c.admin_id]);
                if (a.length) {
                    console.log(`  -> Linked Admin: ID=${a[0].id}, UserID=${a[0].user_id}`);
                    // Check Admin -> User
                    if (a[0].user_id) {
                        const [au] = await db.query("SELECT * FROM users WHERE id = ?", [a[0].user_id]);
                        if (au.length) console.log(`    -> Admin's User: ID=${au[0].id}, Email=${au[0].email}`);
                        else console.log(`    -> Admin's User: NOT FOUND (ID ${a[0].user_id})`);
                    }
                } else {
                    console.log(`  -> Linked Admin: NOT FOUND (ID ${c.admin_id})`);
                }
            } else {
                console.log(`  -> Linked Admin: ID is NULL`);
            }
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        // We can't easily close pool if it's not exposed, but script will end.
        process.exit();
    }
}

debugData();
