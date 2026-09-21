
$path = "c:\Kiaan\Payroll1\backend\src\controllers\employer.controller.js"
$lines = Get-Content $path
$newLines = $lines[0..1665] + $lines[1753..($lines.Count-1)]
$newLines | Set-Content $path -Encoding UTF8
