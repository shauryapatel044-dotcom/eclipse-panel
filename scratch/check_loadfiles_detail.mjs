import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('async function loadFiles(');
console.log(html.slice(idx, idx + 1800));
