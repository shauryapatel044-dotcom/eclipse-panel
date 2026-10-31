import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('id="files-editor-view"');
const end = html.indexOf('<!-- TAB: DATABASES -->', idx);
console.log(html.slice(idx, end));
