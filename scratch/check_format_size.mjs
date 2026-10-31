import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('function formatFileSize(');
console.log(html.slice(idx, idx + 400));
