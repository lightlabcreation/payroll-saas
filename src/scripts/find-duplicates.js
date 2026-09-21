
const fs = require('fs');
const path = 'c:\\Kiaan\\Payroll1\\backend\\src\\controllers\\employer.controller.js';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');

    console.log('Searching in:', path);
    console.log('Total lines:', lines.length);

    lines.forEach((line, index) => {
        if (line.includes('getEmployeeAttendance')) {
            console.log(`Line ${index + 1}: ${line.trim()}`);
        }
        if (line.includes('markAttendance')) {
            console.log(`Line ${index + 1}: ${line.trim()}`);
        }
    });

} catch (err) {
    console.error('Error reading file:', err);
}
