import fs from 'fs';
import path from 'path';

const publicDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel\\public';
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const p = path.join(publicDir, f);
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split(/\r?\n/);
  
  lines.forEach((line, i) => {
    if (/nebula|pterodactyl|blueprint/i.test(line)) {
      // ignore class names if it's just CSS class unless it has user-facing text
      console.log(`[${f}:${i + 1}] ${line.trim().slice(0, 120)}`);
    }
  });
});
