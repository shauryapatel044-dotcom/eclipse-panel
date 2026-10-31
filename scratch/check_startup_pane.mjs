import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const idx = html.indexOf('<div id="pane-startup"');
const end = html.indexOf('<div id="pane-settings"', idx);
console.log(html.slice(idx, end));
