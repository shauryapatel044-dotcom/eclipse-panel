import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const sIdx = appHtml.indexOf('<style>');
const eIdx = appHtml.indexOf('</style>');
console.log(appHtml.slice(sIdx, eIdx + 8));
