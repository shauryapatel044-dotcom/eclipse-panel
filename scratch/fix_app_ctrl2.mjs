import fs from 'fs';

let code = fs.readFileSync('src/controllers/appController.js', 'utf8');
const badStr = 'const logs = stmt.all(%%, %%, %%);';
const goodStr = "const param = '%' + id + '%';\n      const logs = stmt.all(param, param, param);";
code = code.replace(badStr, goodStr);
fs.writeFileSync('src/controllers/appController.js', code, 'utf8');
console.log('Fixed stmt.all in appController.js');
