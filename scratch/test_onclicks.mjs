import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const onclickMatches = [...html.matchAll(/onclick=["']([^"']+)["']/g)];
console.log('Total onclick attributes in app.html:', onclickMatches.length);
const onclickSet = new Set(onclickMatches.map(m => m[1]));
console.log('Unique onclick handlers:', Array.from(onclickSet));
