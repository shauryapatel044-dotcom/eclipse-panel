import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const matches = [];
let pos = 0;
while ((pos = appHtml.indexOf('initNebulaEditor', pos)) !== -1) {
  matches.push(pos);
  pos += 16;
}
console.log('initNebulaEditor occurrences at:', matches);
matches.forEach(p => console.log(appHtml.slice(p - 30, p + 50)));
