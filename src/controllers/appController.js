import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';
import { logStreamer } from '../daemon/logStreamer.js';

export class AppController {
  static async getApps(req, res) {
    try {
      let apps = [];
      if (req.user.role === 'admin') {
        const stmt = db.prepare(`
          SELECT a.*, u.username as owner_username, u.email as owner_email
          FROM apps a
          JOIN users u ON a.user_id = u.id
          ORDER BY a.created_at DESC
        `);
        apps = stmt.all();
      } else {
        const stmt = db.prepare(`
          SELECT * FROM apps
          WHERE user_id = ?
          ORDER BY created_at DESC
        `);
        apps = stmt.all(req.user.id);
      }

      // Augment each app with live runtime metrics
      const enriched = apps.map((app) => {
        const isRunning = supervisor.isRunning(app.id);
        const metrics = supervisor.getMetrics(app.id);
        let parsedEnv = {};
        try {
          parsedEnv = JSON.parse(app.env_vars || '{}');
        } catch (e) {}

        return {
          ...app,
          status: isRunning ? 'running' : (app.status === 'running' ? 'stopped' : app.status),
          metrics,
          env_vars: parsedEnv,
        };
      });

      return res.json({ apps: enriched });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getAppById(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare(`
        SELECT a.*, u.username as owner_username
        FROM apps a
        JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
      `);
      const app = stmt.get(id);

      if (!app) {
        return res.status(404).json({ error: 'Application not found' });
      }

      // Check ownership
      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: Access denied to this application' });
      }

      const isRunning = supervisor.isRunning(app.id);
      const metrics = supervisor.getMetrics(app.id);
      const logs = logStreamer.getLogs(app.id, 100);

      let parsedEnv = {};
      try {
        parsedEnv = JSON.parse(app.env_vars || '{}');
      } catch (e) {}

      return res.json({
        app: {
          ...app,
          status: isRunning ? 'running' : app.status,
          metrics,
          logs,
          env_vars: parsedEnv,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async createApp(req, res) {
    try {
      const { name, type, entrypoint, port, env_vars, auto_restart, memory_limit, cpu_limit } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: 'App name and type (nodejs | python) are required' });
      }

      const normalizedType = type.toLowerCase().trim();
      if (!['nodejs', 'python'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Type must be either "nodejs" or "python"' });
      }

      const appId = `app_${crypto.randomBytes(4).toString('hex')}`;
      const defaultEntry = normalizedType === 'nodejs' ? (entrypoint || 'index.js') : (entrypoint || 'main.py');
      const envJson = typeof env_vars === 'object' ? JSON.stringify(env_vars) : (env_vars || '{}');
      const autoRestartVal = auto_restart === false || auto_restart === 0 ? 0 : 1;
      const appPort = port ? parseInt(port, 10) : null;
      const memLimit = memory_limit ? parseInt(memory_limit, 10) : 1024;
      const cpLimit = cpu_limit ? parseInt(cpu_limit, 10) : 100;

      // Insert into database
      const insertStmt = db.prepare(`
        INSERT INTO apps (id, name, type, user_id, entrypoint, port, env_vars, auto_restart, memory_limit, cpu_limit, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped')
      `);
      insertStmt.run(appId, name.trim(), normalizedType, req.user.id, defaultEntry, appPort, envJson, autoRestartVal, memLimit, cpLimit);

      // Create app directory and starter template
      const appDir = supervisor.getAppDir(appId);
      
      if (normalizedType === 'nodejs') {
        const starterIndex = `// CrimsonPanel Node.js Application Starter
import http from 'http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    app: '${name.trim()}',
    time: new Date().toISOString(),
    message: 'Hello from CrimsonPanel Node.js Server!'
  }));
});

server.listen(PORT, () => {
  console.log(\`Server is live and listening on port \${PORT}\`);
});
`;
        const starterPackage = {
          name: name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          version: '1.0.0',
          type: 'module',
          main: defaultEntry,
          scripts: {
            start: `node ${defaultEntry}`,
          },
        };

        fs.writeFileSync(path.join(appDir, defaultEntry), starterIndex, 'utf8');
        fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(starterPackage, null, 2), 'utf8');
      } else if (normalizedType === 'python') {
        const starterPy = `# CrimsonPanel Python Application Starter
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

PORT = int(os.environ.get("PORT", 8000))

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        payload = {
            "status": "online",
            "app": "${name.trim()}",
            "python_version": sys.version,
            "message": "Hello from CrimsonPanel Python Service!"
        }
        self.wfile.write(json.dumps(payload).encode('utf-8'))

if __name__ == '__main__':
    print(f"Starting CrimsonPanel Python Server on port {PORT}...")
    server = HTTPServer(('0.0.0.0', PORT), SimpleHandler)
    server.serve_forever()
`;
        const starterReq = `# List your Python dependencies here (e.g. fastapi, uvicorn, requests)\nrequests\n`;

        fs.writeFileSync(path.join(appDir, defaultEntry), starterPy, 'utf8');
        fs.writeFileSync(path.join(appDir, 'requirements.txt'), starterReq, 'utf8');
      }

      logStreamer.append(appId, 'system', `[Init] Application "${name}" created with starter template.`);

      return res.status(201).json({
        message: 'Application created successfully',
        appId,
        name,
        type: normalizedType,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateApp(req, res) {
    try {
      const { id } = req.params;
      const { name, entrypoint, port, env_vars, auto_restart, memory_limit, cpu_limit, type } = req.body;

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const newName = name !== undefined ? name.trim() : app.name;
      const newType = type !== undefined ? type.trim().toLowerCase() : app.type;
      const newEntrypoint = entrypoint !== undefined ? entrypoint.trim() : app.entrypoint;
      const newPort = port !== undefined ? (port ? parseInt(port, 10) : null) : app.port;
      const newAutoRestart = auto_restart !== undefined ? (auto_restart ? 1 : 0) : app.auto_restart;
      const newMem = memory_limit !== undefined ? (memory_limit ? parseInt(memory_limit, 10) : 1024) : (app.memory_limit || 1024);
      const newCpu = cpu_limit !== undefined ? (cpu_limit ? parseInt(cpu_limit, 10) : 100) : (app.cpu_limit || 100);
      const newEnv = env_vars !== undefined ? (typeof env_vars === 'object' ? JSON.stringify(env_vars) : env_vars) : app.env_vars;

      const updateStmt = db.prepare(`
        UPDATE apps
        SET name = ?, type = ?, entrypoint = ?, port = ?, env_vars = ?, auto_restart = ?, memory_limit = ?, cpu_limit = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(newName, newType, newEntrypoint, newPort, newEnv, newAutoRestart, newMem, newCpu, id);

      logStreamer.append(id, 'system', `[Config Updated] Specs updated: Port=${newPort}, RAM=${newMem}MB, CPU=${newCpu}%, Entry=${newEntrypoint}`);

      return res.json({ message: 'Server specs and configuration updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async sendCommand(req, res) {
    try {
      const { id } = req.params;
      const { command } = req.body;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'Server not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const result = await supervisor.sendCommand(id, command);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async deleteApp(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Stop process if running
      await supervisor.stopApp(id);

      // Clean directory from disk
      const appDir = supervisor.getAppDir(id);
      try {
        fs.rmSync(appDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not delete app folder: ${e.message}`);
      }

      // Delete from DB
      const delStmt = db.prepare('DELETE FROM apps WHERE id = ?');
      delStmt.run(id);

      logStreamer.clear(id);

      return res.json({ message: 'Application deleted permanently' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async performAction(req, res) {
    try {
      const { id, action } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      switch (action.toLowerCase()) {
        case 'start': {
          const result = await supervisor.startApp(id);
          return res.json(result);
        }
        case 'stop': {
          const result = await supervisor.stopApp(id);
          return res.json(result);
        }
        case 'restart': {
          const result = await supervisor.restartApp(id);
          return res.json(result);
        }
        case 'install': {
          supervisor.installDependencies(id)
            .then(() => logStreamer.append(id, 'system', '[Daemon] Dependencies installation finished.'))
            .catch((err) => logStreamer.append(id, 'system', `[Daemon] Dependency installation failed: ${err.message}`));
          return res.json({ message: 'Dependency installation started in background. Monitor live logs.' });
        }
        default:
          return res.status(400).json({ error: `Unknown action: "${action}". Valid actions: start, stop, restart, install` });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getLogs(req, res) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit || '200', 10);
      const logs = logStreamer.getLogs(id, limit);
      return res.json({ logs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getStats(req, res) {
    try {
      const { id } = req.params;
      const metrics = supervisor.getMetrics(id);
      return res.json({ metrics });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
