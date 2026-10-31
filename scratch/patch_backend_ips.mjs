import fs from 'fs';

// 1. Update src/controllers/appController.js
let appCtrl = fs.readFileSync('src/controllers/appController.js', 'utf8');

if (!appCtrl.includes("import { getHostIp } from '../daemon/metrics.js';")) {
  appCtrl = appCtrl.replace(
    "import { logStreamer } from '../daemon/logStreamer.js';",
    "import { logStreamer } from '../daemon/logStreamer.js';\nimport { getHostIp } from '../daemon/metrics.js';"
  );
}

// In getApps
appCtrl = appCtrl.replace(
  `        return {
          ...app,
          status: isRunning ? 'running' : (app.status === 'running' ? 'stopped' : app.status),`,
  `        const effectiveIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : getHostIp();
        return {
          ...app,
          primary_ip: effectiveIp,
          status: isRunning ? 'running' : (app.status === 'running' ? 'stopped' : app.status),`
);

// In getAppById
appCtrl = appCtrl.replace(
  `      return res.json({
        ...app,
        status: isRunning ? 'running' : (app.status === 'running' ? 'stopped' : app.status),`,
  `      const effectiveIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : getHostIp();
      return res.json({
        ...app,
        primary_ip: effectiveIp,
        status: isRunning ? 'running' : (app.status === 'running' ? 'stopped' : app.status),`
);

// In createApp
appCtrl = appCtrl.replace(
  `const serverIp = primary_ip ? primary_ip.trim() : '0.0.0.0';`,
  `const serverIp = (primary_ip && primary_ip.trim() !== '0.0.0.0' && primary_ip.trim() !== '127.0.0.1') ? primary_ip.trim() : getHostIp();`
);

fs.writeFileSync('src/controllers/appController.js', appCtrl, 'utf8');
console.log('✓ Updated appController.js with real host IP resolution');

// 2. Update src/controllers/databaseController.js
let dbCtrl = fs.readFileSync('src/controllers/databaseController.js', 'utf8');

if (!dbCtrl.includes("import { getHostIp } from '../daemon/metrics.js';")) {
  dbCtrl = dbCtrl.replace(
    "import { supervisor } from '../daemon/supervisor.js';",
    "import { supervisor } from '../daemon/supervisor.js';\nimport { getHostIp } from '../daemon/metrics.js';"
  );
}

// In listDatabases: return real host IP if host is 127.0.0.1
dbCtrl = dbCtrl.replace(
  `      const databases = stmt.all(id);

      return res.json({ databases });`,
  `      const rawDatabases = stmt.all(id);
      const hostIp = getHostIp();
      const databases = rawDatabases.map(d => ({
        ...d,
        host: (d.host && d.host !== '127.0.0.1') ? d.host : hostIp
      }));

      return res.json({ databases });`
);

// In createDatabase: use hostIp
dbCtrl = dbCtrl.replace(
  `      const insertStmt = db.prepare(\`
        INSERT INTO app_databases (id, app_id, db_name, db_user, db_password, host, port)
        VALUES (?, ?, ?, ?, ?, '127.0.0.1', 3306)
      \`);
      insertStmt.run(dbId, id, dbName, dbUser, dbPass);`,
  `      const hostIp = getHostIp();
      const insertStmt = db.prepare(\`
        INSERT INTO app_databases (id, app_id, db_name, db_user, db_password, host, port)
        VALUES (?, ?, ?, ?, ?, ?, 3306)
      \`);
      insertStmt.run(dbId, id, dbName, dbUser, dbPass, hostIp);`
);

dbCtrl = dbCtrl.replace(
  `      envVars.DB_HOST = '127.0.0.1';
      envVars.DB_PORT = '3306';
      envVars.DB_NAME = dbName;
      envVars.DB_USER = dbUser;
      envVars.DB_PASS = dbPass;
      envVars.DATABASE_URL = \`mysql://\${dbUser}:\${dbPass}@127.0.0.1:3306/\${dbName}\`;`,
  `      envVars.DB_HOST = hostIp;
      envVars.DB_PORT = '3306';
      envVars.DB_NAME = dbName;
      envVars.DB_USER = dbUser;
      envVars.DB_PASS = dbPass;
      envVars.DATABASE_URL = \`mysql://\${dbUser}:\${dbPass}@\${hostIp}:3306/\${dbName}\`;`
);

dbCtrl = dbCtrl.replace(
  `          host: '127.0.0.1',
          port: 3306,
          connection_url: \`mysql://\${dbUser}:\${dbPass}@127.0.0.1:3306/\${dbName}\``,
  `          host: hostIp,
          port: 3306,
          connection_url: \`mysql://\${dbUser}:\${dbPass}@\${hostIp}:3306/\${dbName}\``
);

fs.writeFileSync('src/controllers/databaseController.js', dbCtrl, 'utf8');
console.log('✓ Updated databaseController.js with real host IP and password visibility');
