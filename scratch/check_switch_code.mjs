import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');

// Check lines around switchConsoleTab
const idx = html.indexOf('function switchConsoleTab');
console.log(html.slice(idx, idx + 1600));
