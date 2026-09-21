
const fs = require('fs');
const path = 'c:\\Kiaan\\Payroll1\\backend\\src\\controllers\\employer.controller.js';

try {
    let content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');
    const newLines = [];

    let getCount = 0;
    let markCount = 0;

    // We want to keep the one around line 1092/1137.
    // Or just keep the first one found?
    // Let's print what we find first to be safe, then decide in logic.
    // Actually, let's just keep the one that looks like a function definition "const X = async"
    // And if we find MULTIPLE, we keep the first one and comment out/remove the others.

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('const getEmployeeAttendance = async')) {
            getCount++;
            if (getCount > 1) {
                console.log(`Removing duplicate getEmployeeAttendance at line ${i + 1}`);
                // Skip this line and potentially the function body? 
                // Removing just the declarator might cause syntax error if body follows.
                // We should comment it out or remove block?
                // Simple removal: empty line.
                newLines.push('// Duplicate removed: ' + line);
                continue;
            }
        }

        if (line.includes('const markAttendance = async')) {
            markCount++;
            if (markCount > 1) {
                console.log(`Removing duplicate markAttendance at line ${i + 1}`);
                newLines.push('// Duplicate removed: ' + line);
                continue;
            }
        }

        newLines.push(line);
    }

    fs.writeFileSync(path, newLines.join('\n'), 'utf8');
    console.log('File updated.');

} catch (err) {
    console.error('Error:', err);
}
