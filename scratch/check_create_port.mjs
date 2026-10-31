import fs from 'fs';

const code = fs.readFileSync('src/controllers/appController.js', 'utf8');
const idx = code.indexOf('const appId =');
console.log(code.slice(idx, idx + 1400));
