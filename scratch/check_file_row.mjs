import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('files.forEach(f => {');
console.log(html.slice(idx, idx + 2000));
