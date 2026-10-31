import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const cssPath = path.join(panelDir, 'public', 'css', 'eclipse.css');
const css = fs.readFileSync(cssPath, 'utf8');

function showClass(name, len = 600) {
  const idx = css.indexOf('.' + name);
  console.log(`\n=== .${name} ===`);
  if (idx !== -1) {
    console.log(css.slice(idx, idx + len));
  } else {
    console.log('Not found');
  }
}

showClass('nebula-server-sidebar', 800);
showClass('nebula-power-circle-group', 800);
showClass('nebula-circle-btn', 800);
showClass('nebula-spec-card', 800);
showClass('nebula-spec-stack', 500);
