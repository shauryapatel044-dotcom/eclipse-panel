import fs from 'fs';
import path from 'path';

const p = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel\\public\\index.html';
let html = fs.readFileSync(p, 'utf8');

html = html.replace(
  'Pterodactyl Nebula runtime clusters executing Node.js & Python containerized services.',
  'Eclipse Panel runtime clusters executing containerized services and web applications.'
);

html = html.replace('NEBULA STUDIO', 'ECLIPSE DEPLOY STUDIO');
html = html.replace("'nebula-core'", "'eclipse-core'");

fs.writeFileSync(p, html, 'utf8');
console.log('✓ index.html text cleaned of all nebula/pterodactyl references');
