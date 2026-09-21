
const fs = require('fs');

const files = [
    'c:\\Kiaan\\Payroll1\\backend\\src\\controllers\\employee.controller.js',
    'c:\\Kiaan\\Payroll1\\backend\\src\\controllers\\public.controller.js'
];

files.forEach(file => {
    console.log(`Fixing ${file}...`);
    let content = fs.readFileSync(file, 'utf8');

    // 1. Rename training tables
    content = content.replace(/training_assignments/g, 'training_enrollments');
    content = content.replace(/trainings/g, 'training_courses');

    // 2. Fix company joins to use employers table
    // Replace: LEFT JOIN companies emp ON e.company_id = emp.id
    // Or: JOIN companies e ON j.employer_id = e.id
    content = content.replace(/JOIN companies emp ON e.company_id = emp.id/g, 'JOIN employers emp ON e.employer_id = emp.id');
    content = content.replace(/LEFT JOIN companies emp ON e.company_id = emp.id/g, 'LEFT JOIN employers emp ON e.employer_id = emp.id');
    content = content.replace(/JOIN companies e ON j.employer_id = e.id/g, 'JOIN employers e ON j.employer_id = e.id');
    content = content.replace(/LEFT JOIN companies e ON j.employer_id = e.id/g, 'LEFT JOIN employers e ON j.employer_id = e.id');

    fs.writeFileSync(file, content);
    console.log(`Done fixing ${file}`);
});
