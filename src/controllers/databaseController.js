import { checkAppAccess } from '../utils/permissions.js';
import crypto from 'crypto';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';
import { getHostIp } from '../daemon/metrics.js';

export class DatabaseController {
  // List all databases assigned to this app
  static async listDatabases(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT id, app_id, db_name, db_user, db_password, host, port, created_at FROM app_databases WHERE app_id = ? ORDER BY created_at DESC');
      const rawDatabases = stmt.all(id);
      const hostIp = getHostIp();
      const databases = rawDatabases.map(d => ({
        ...d,
        host: (d.host && d.host !== '127.0.0.1') ? d.host : hostIp
      }));

      return res.json({ databases });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Create isolated MariaDB / MySQL database
  static async createDatabase(req, res) {
    try {
      const { id } = req.params;
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      // Check permission
      if (!checkAppAccess(id, req.user, 'database')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const rawSuffix = crypto.randomBytes(3).toString('hex');
      const dbName = `db_${id.replace('app_', '')}_${rawSuffix}`;
      const dbUser = `u_${rawSuffix}`;
      const dbPass = crypto.randomBytes(12).toString('base64url');
      const dbId = `db_${crypto.randomBytes(4).toString('hex')}`;

      // Insert record in app_databases
      const hostIp = getHostIp();
      const insertStmt = db.prepare(`
        INSERT INTO app_databases (id, app_id, db_name, db_user, db_password, host, port)
        VALUES (?, ?, ?, ?, ?, ?, 3306)
      `);
      insertStmt.run(dbId, id, dbName, dbUser, dbPass, hostIp);

      // Attempt to provision on host MariaDB if mysql client is available
      try {
        const { exec } = await import('child_process');
        const sqlCmd = `CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\`; CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'; GRANT ALL PRIVILEGES ON \\\`${dbName}\\\`.* TO '${dbUser}'@'%'; FLUSH PRIVILEGES;`;
        exec(`mariadb -e "${sqlCmd}" || mysql -e "${sqlCmd}"`, (err) => {
          if (err) console.log('[Database Generator] Host mysql note:', err.message);
        });
      } catch (e) {}

      // Auto-inject into app's env_vars
      let envVars = {};
      try { envVars = JSON.parse(app.env_vars || '{}'); } catch (e) {}
      envVars.DB_HOST = hostIp;
      envVars.DB_PORT = '3306';
      envVars.DB_NAME = dbName;
      envVars.DB_USER = dbUser;
      envVars.DB_PASS = dbPass;
      envVars.DATABASE_URL = `mysql://${dbUser}:${dbPass}@${hostIp}:3306/${dbName}`;

      db.prepare('UPDATE apps SET env_vars = ? WHERE id = ?').run(JSON.stringify(envVars), id);

      return res.status(201).json({
        message: `Database "${dbName}" created and injected into environment variables!`,
        database: {
          id: dbId,
          db_name: dbName,
          db_user: dbUser,
          db_password: dbPass,
          host: hostIp,
          port: 3306,
          connection_url: `mysql://${dbUser}:${dbPass}@${hostIp}:3306/${dbName}`
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Delete database
  static async deleteDatabase(req, res) {
    try {
      const { id, dbId } = req.params;
      const appDb = db.prepare('SELECT * FROM app_databases WHERE id = ? AND app_id = ?').get(dbId, id);
      if (!appDb) return res.status(404).json({ error: 'Database record not found' });

      // Drop on MariaDB if available
      try {
        const { exec } = await import('child_process');
        const sqlCmd = `DROP DATABASE IF EXISTS \\\`${appDb.db_name}\\\`; DROP USER IF EXISTS '${appDb.db_user}'@'%'; FLUSH PRIVILEGES;`;
        exec(`mariadb -e "${sqlCmd}" || mysql -e "${sqlCmd}"`, () => {});
      } catch (e) {}

      db.prepare('DELETE FROM app_databases WHERE id = ?').run(dbId);
      return res.json({ message: `Database "${appDb.db_name}" purged successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
