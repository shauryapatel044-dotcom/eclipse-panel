import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const lines = fs.readFileSync(appHtmlPath, 'utf8').split(/\r?\n/);

console.log('=== PANE-FILES (468-558) ===');
console.log(lines.slice(467, 558).join('\n'));
