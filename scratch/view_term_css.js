import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const cssPath = path.join(panelDir, 'public', 'css', 'eclipse.css');
const css = fs.readFileSync(cssPath, 'utf8');

function showClass(name, len = 700) {
  const idx = css.indexOf('.' + name);
  console.log(`\n=== .${name} ===`);
  if (idx !== -1) {
    console.log(css.slice(idx, idx + len));
  } else {
    console.log('Not found');
  }
}

showClass('nebula-terminal-container', 600);
showClass('nebula-terminal-input-bar', 600);
showClass('nebula-terminal-body', 600);
showClass('nebula-demo-banner', 600);
