import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const lines = fs.readFileSync(appHtmlPath, 'utf8').split(/\r?\n/);

console.log('=== PANE-STARTUP (700-745) ===');
console.log(lines.slice(700, 745).join('\n'));
