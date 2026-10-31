import fs from 'fs';

let code = fs.readFileSync('src/controllers/appController.js', 'utf8');

code = code.replace(
  `      return res.json({\r\n        app: {\r\n          ...app,\r\n          status: isRunning ? 'running' : app.status,`,
  `      const effectiveIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : getHostIp();\r\n      return res.json({\r\n        app: {\r\n          ...app,\r\n          primary_ip: effectiveIp,\r\n          status: isRunning ? 'running' : app.status,`
);

// Fallback in case of LF line endings
code = code.replace(
  `      return res.json({\n        app: {\n          ...app,\n          status: isRunning ? 'running' : app.status,`,
  `      const effectiveIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : getHostIp();\n      return res.json({\n        app: {\n          ...app,\n          primary_ip: effectiveIp,\n          status: isRunning ? 'running' : app.status,`
);

fs.writeFileSync('src/controllers/appController.js', code, 'utf8');
console.log('✓ Successfully patched getAppById in appController.js');
