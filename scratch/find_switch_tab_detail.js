import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const idx = appHtml.indexOf('function switchConsoleTab(');
console.log(appHtml.slice(idx, idx + 1500));
