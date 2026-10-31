import fs from 'fs';

let code = fs.readFileSync('src/controllers/appController.js', 'utf8');
const badStr = 'const stmt = db.prepare(SELECT id, action, details, created_at, username FROM audit_logs WHERE details LIKE ? OR details LIKE ? OR action LIKE ? ORDER BY created_at DESC LIMIT 50);';
const goodStr = "const stmt = db.prepare('SELECT id, action, details, created_at, username FROM audit_logs WHERE details LIKE ? OR details LIKE ? OR action LIKE ? ORDER BY created_at DESC LIMIT 50');";
code = code.replace(badStr, goodStr);
fs.writeFileSync('src/controllers/appController.js', code, 'utf8');
console.log('Fixed syntax error in appController.js');
