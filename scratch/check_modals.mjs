import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const modalMatches = [...html.matchAll(/id=['"]modal-[^'"]+['"]/g)];
console.log('Modals in app.html:', modalMatches.map(m => m[0]));

// Check modal styles
const modalCssMatches = [...html.matchAll(/\.modal[^{]*\{[^}]*\}/g)];
modalCssMatches.forEach(m => console.log('CSS:', m[0]));
