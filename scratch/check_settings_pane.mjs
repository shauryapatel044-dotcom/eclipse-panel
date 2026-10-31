import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('<div id="pane-settings"');
const end = html.indexOf('<div id="pane-activity"', idx);
console.log(html.slice(idx, end));
