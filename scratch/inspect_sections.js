import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const lines = appHtml.split(/\r?\n/);

console.log('Total lines in app.html:', lines.length);

lines.forEach((line, i) => {
  if (line.includes('id="pane-files"') || 
      line.includes('id="pane-startup"') || 
      line.includes('function loadStartupConfig') || 
      line.includes('function loadFiles')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
