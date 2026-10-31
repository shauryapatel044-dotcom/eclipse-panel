import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const filesIdx = html.indexOf('<div id="pane-files"');
const filesClose = html.indexOf('<div id="pane-databases"', filesIdx);
console.log(html.slice(filesIdx, filesClose));
