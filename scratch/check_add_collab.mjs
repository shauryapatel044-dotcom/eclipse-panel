import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('id="modal-add-collab"');
console.log(html.slice(idx, idx + 1400));
