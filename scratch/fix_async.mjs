import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');
html = html.replace('async async function loadCollaborators()', 'async function loadCollaborators()');
fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Fixed double async');
