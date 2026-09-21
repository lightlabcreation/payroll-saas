
const fs = require('fs');
const path = 'c:\\Kiaan\\Payroll1\\backend\\src\\controllers\\employer.controller.js';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Replace connection.query(...)
    const search1 = "query('SELECT * FROM companies WHERE id = ?', [req.user.company_id])";
    const replace1 = "query('SELECT * FROM employers WHERE user_id = ?', [req.user.id])";

    // Replace db.query(...) (if used in getDashboard)
    const search2 = "db.query('SELECT * FROM companies WHERE id = ?', [req.user.company_id])";
    const replace2 = "db.query('SELECT * FROM employers WHERE user_id = ?', [req.user.id])";

    // Handling double quotes if any
    const search3 = 'query("SELECT * FROM companies WHERE id = ?", [req.user.company_id])';
    const replace3 = 'query("SELECT * FROM employers WHERE user_id = ?", [req.user.id])';

    let newContent = content.split(search1).join(replace1);
    newContent = newContent.split(search2).join(replace2);
    newContent = newContent.split(search3).join(replace3);

    if (content !== newContent) {
        fs.writeFileSync(path, newContent, 'utf8');
        console.log('Fixed queries in employer.controller.js');
    } else {
        console.log('No matches found to replace.');
    }

} catch (err) {
    console.error('Error:', err);
}
