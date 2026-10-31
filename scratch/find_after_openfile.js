import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const startIdx = appHtml.indexOf('// STARTUP TAB LOGIC');
const sub = appHtml.slice(startIdx, startIdx + 20000);
const lines = sub.split(/\r?\n/);

console.log(lines.slice(340, 420).join('\n'));
