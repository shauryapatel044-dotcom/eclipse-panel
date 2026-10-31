import dns from 'dns';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';
import { logStreamer } from '../daemon/logStreamer.js';
import { getHostIp } from '../daemon/metrics.js';

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

      const effectiveIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : getHostIp();
      return res.json({
        app: {
          ...app,
          primary_ip: effectiveIp,
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
      const { 
        name, 
        type, 
        entrypoint, 
        port, 
        env_vars, 
        auto_restart, 
        memory_limit, 
        cpu_limit,
        disk_limit,
        primary_ip,
        domain,
        runtime_version,
        startup_cmd,
        main_file,
        node_packages,
        node_args,
        requirements_file
      } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: 'App name and type (nodejs | python) are required' });
      }

      const normalizedType = type.toLowerCase().trim();
      if (!['nodejs', 'python'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Type must be either "nodejs" or "python"' });
      }

      const appId = `app_${crypto.randomBytes(4).toString('hex')}`;
      const defaultEntry = main_file || entrypoint || (normalizedType === 'nodejs' ? 'index.js' : 'main.py');
      const envJson = typeof env_vars === 'object' ? JSON.stringify(env_vars) : (env_vars || '{}');
      const autoRestartVal = auto_restart === false || auto_restart === 0 ? 0 : 1;
      let appPort = port ? parseInt(port, 10) : null;
      if (!appPort) {
        const appsWithPort = db.prepare('SELECT port FROM apps WHERE port IS NOT NULL').all();
        const usedPorts = new Set(appsWithPort.map(a => a.port));
        let candidate = 3000;
        while (usedPorts.has(candidate) && candidate < 9999) {
          candidate++;
        }
        appPort = candidate;
      }
      const memLimit = memory_limit ? parseInt(memory_limit, 10) : 1024;
      const cpLimit = cpu_limit ? parseInt(cpu_limit, 10) : 100;
      const diskLimit = disk_limit ? parseInt(disk_limit, 10) : 5120;
      const serverIp = (primary_ip && primary_ip.trim() !== '0.0.0.0' && primary_ip.trim() !== '127.0.0.1') ? primary_ip.trim() : getHostIp();
      const baseDomain = process.env.BASE_DOMAIN || '';
      const serverDomain = domain ? domain.trim() : (baseDomain ? `${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}.${baseDomain}` : '');
      const rVersion = runtime_version ? runtime_version.trim() : (normalizedType === 'nodejs' ? '20' : '3.11');

      const defaultNodeStartup = `if [[ -d .git ]] && [[ 0 == "1" ]]; then git pull; fi; if [[ ! -z "\${NODE_PACKAGES}" ]]; then npm install \${NODE_PACKAGES}; fi; if [[ ! -z "\${UNNODE_PACKAGES}" ]]; then npm uninstall \${UNNODE_PACKAGES}; fi; if [ -f package.json ]; then npm install; fi; if [[ "\${MAIN_FILE##*.}" == "js" ]]; then node "\${MAIN_FILE}" \${NODE_ARGS}; else ts-node --esm "\${MAIN_FILE}" \${NODE_ARGS}; fi`;
      const defaultPythonStartup = `if [[ -d .git ]] && [[ "0" == "1" ]]; then git pull; fi; if [[ ! -z "" ]]; then pip install -U --prefix .local ; fi; if [[ -f "\${REQUIREMENTS_FILE}" ]]; then pip install -U --prefix .local -r "\${REQUIREMENTS_FILE}"; fi; python "\${MAIN_FILE}"`;

      const startCmd = startup_cmd || (normalizedType === 'nodejs' ? defaultNodeStartup : defaultPythonStartup);
      const reqFile = requirements_file || 'requirements.txt';
      const nPackages = node_packages || '';
      const nArgs = node_args || '';

      // Insert into database
      const insertStmt = db.prepare(`
        INSERT INTO apps (
          id, name, type, user_id, entrypoint, port, env_vars, auto_restart, 
          memory_limit, cpu_limit, disk_limit, primary_ip, domain, runtime_version, 
          startup_cmd, main_file, node_packages, node_args, requirements_file, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'installing')
      `);
      insertStmt.run(
        appId, name.trim(), normalizedType, req.user.id, defaultEntry, appPort, envJson, autoRestartVal,
        memLimit, cpLimit, diskLimit, serverIp, serverDomain, rVersion,
        startCmd, defaultEntry, nPackages, nArgs, reqFile
      );

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

      logStreamer.append(appId, 'system', `[Eclipse Daemon] Provisioning container files for "${name.trim()}"...`);
      logStreamer.append(appId, 'system', `[Supervisor] Installing initial package dependencies (npm install / pip install)...`);
      supervisor.installDependencies(appId)
        .then(() => {
          logStreamer.append(appId, 'system', '[Supervisor] Initial packages and environment ready.');
          supervisor.updateAppStatus(appId, 'stopped');
        })
        .catch((err) => {
          logStreamer.append(appId, 'system', `[Supervisor] Dependency setup notice: ${err.message}`);
          supervisor.updateAppStatus(appId, 'stopped');
        });

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
      const { 
        name, 
        entrypoint, 
        port, 
        env_vars, 
        auto_restart, 
        memory_limit, 
        cpu_limit, 
        disk_limit,
        primary_ip,
        domain,
        type,
        runtime_version,
        startup_cmd,
        main_file,
        node_packages,
        unnode_packages,
        node_args,
        requirements_file
      } = req.body;

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Role check: Regular users cannot modify hardware specs (RAM, CPU, Disk, Port, IP)
      if (req.user.role !== 'admin') {
        if (
          (memory_limit !== undefined && parseInt(memory_limit, 10) !== app.memory_limit) ||
          (cpu_limit !== undefined && parseInt(cpu_limit, 10) !== app.cpu_limit) ||
          (disk_limit !== undefined && parseInt(disk_limit, 10) !== app.disk_limit) ||
          (port !== undefined && parseInt(port, 10) !== app.port) ||
          (primary_ip !== undefined && primary_ip.trim() !== app.primary_ip)
        ) {
          return res.status(403).json({ error: 'Permission denied: Hardware specifications can only be modified by an Administrator.' });
        }
      }

      const newName = name !== undefined ? name.trim() : app.name;
      const newType = type !== undefined ? type.trim().toLowerCase() : app.type;
      const newEntrypoint = entrypoint !== undefined ? entrypoint.trim() : app.entrypoint;
      const newPort = port !== undefined ? (port ? parseInt(port, 10) : null) : app.port;
      const newAutoRestart = auto_restart !== undefined ? (auto_restart ? 1 : 0) : app.auto_restart;
      const newMem = memory_limit !== undefined ? (memory_limit ? parseInt(memory_limit, 10) : 1024) : (app.memory_limit || 1024);
      const newCpu = cpu_limit !== undefined ? (cpu_limit ? parseInt(cpu_limit, 10) : 100) : (app.cpu_limit || 100);
      const newDisk = disk_limit !== undefined ? (disk_limit ? parseInt(disk_limit, 10) : 5120) : (app.disk_limit || 5120);
      const newIp = primary_ip !== undefined ? primary_ip.trim() : (app.primary_ip || '0.0.0.0');
      const newDomain = domain !== undefined ? domain.trim() : (app.domain || '');
      const newRVersion = runtime_version !== undefined ? runtime_version.trim() : (app.runtime_version || '');
      const newStartupCmd = startup_cmd !== undefined ? startup_cmd : (app.startup_cmd || '');
      const newMainFile = main_file !== undefined ? main_file.trim() : (app.main_file || app.entrypoint);
      const newPackages = node_packages !== undefined ? node_packages : (app.node_packages || '');
      const newUnPackages = unnode_packages !== undefined ? unnode_packages : (app.unnode_packages || '');
      const newArgs = node_args !== undefined ? node_args : (app.node_args || '');
      const newReqs = requirements_file !== undefined ? requirements_file : (app.requirements_file || 'requirements.txt');
      const newEnv = env_vars !== undefined ? (typeof env_vars === 'object' ? JSON.stringify(env_vars) : env_vars) : app.env_vars;

      const updateStmt = db.prepare(`
        UPDATE apps
        SET name = ?, type = ?, entrypoint = ?, port = ?, env_vars = ?, auto_restart = ?, 
            memory_limit = ?, cpu_limit = ?, disk_limit = ?, primary_ip = ?, domain = ?,
            runtime_version = ?, startup_cmd = ?, main_file = ?, node_packages = ?,
            unnode_packages = ?, node_args = ?, requirements_file = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(
        newName, newType, newEntrypoint, newPort, newEnv, newAutoRestart, 
        newMem, newCpu, newDisk, newIp, newDomain,
        newRVersion, newStartupCmd, newMainFile, newPackages,
        newUnPackages, newArgs, newReqs, id
      );

      logStreamer.append(id, 'system', `[Config Updated] Specs updated: Port=${newPort}, RAM=${newMem}MB, CPU=${newCpu}%, Disk=${newDisk}MB, IP=${newIp}, Domain=${newDomain}`);

      return res.json({ message: 'Server specs and settings updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getStartup(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const defaultNodeStartup = `if [[ -d .git ]] && [[ 0 == "1" ]]; then git pull; fi; if [[ ! -z "\${NODE_PACKAGES}" ]]; then npm install \${NODE_PACKAGES}; fi; if [[ ! -z "\${UNNODE_PACKAGES}" ]]; then npm uninstall \${UNNODE_PACKAGES}; fi; if [ -f package.json ]; then npm install; fi; if [[ "\${MAIN_FILE##*.}" == "js" ]]; then node "\${MAIN_FILE}" \${NODE_ARGS}; else ts-node --esm "\${MAIN_FILE}" \${NODE_ARGS}; fi`;
      const defaultPythonStartup = `if [[ -d .git ]] && [[ "0" == "1" ]]; then git pull; fi; if [[ ! -z "" ]]; then pip install -U --prefix .local ; fi; if [[ -f "\${REQUIREMENTS_FILE}" ]]; then pip install -U --prefix .local -r "\${REQUIREMENTS_FILE}"; fi; python "\${MAIN_FILE}"`;

      return res.json({
        startup: {
          type: app.type,
          runtime_version: app.runtime_version || (app.type === 'nodejs' ? '20' : '3.11'),
          startup_cmd: app.startup_cmd || (app.type === 'nodejs' ? defaultNodeStartup : defaultPythonStartup),
          main_file: app.main_file || app.entrypoint || (app.type === 'nodejs' ? 'index.js' : 'main.py'),
          node_packages: app.node_packages || '',
          unnode_packages: app.unnode_packages || '',
          node_args: app.node_args || '',
          requirements_file: app.requirements_file || 'requirements.txt',
          defaults: {
            nodejs: defaultNodeStartup,
            python: defaultPythonStartup
          }
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateStartup(req, res) {
    try {
      const { id } = req.params;
      const { 
        type, 
        runtime_version, 
        startup_cmd, 
        main_file, 
        node_packages, 
        unnode_packages, 
        node_args, 
        requirements_file 
      } = req.body;

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const newType = type ? type.trim().toLowerCase() : app.type;
      const newVersion = runtime_version ? runtime_version.trim() : (app.runtime_version || '');
      const newCmd = startup_cmd !== undefined ? startup_cmd : app.startup_cmd;
      const newMain = main_file ? main_file.trim() : (app.main_file || app.entrypoint);
      const newPkg = node_packages !== undefined ? node_packages : (app.node_packages || '');
      const newUnPkg = unnode_packages !== undefined ? unnode_packages : (app.unnode_packages || '');
      const newArgs = node_args !== undefined ? node_args : (app.node_args || '');
      const newReq = requirements_file !== undefined ? requirements_file : (app.requirements_file || 'requirements.txt');

      const updateStmt = db.prepare(`
        UPDATE apps
        SET type = ?, runtime_version = ?, startup_cmd = ?, main_file = ?, entrypoint = ?,
            node_packages = ?, unnode_packages = ?, node_args = ?, requirements_file = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(newType, newVersion, newCmd, newMain, newMain, newPkg, newUnPkg, newArgs, newReq, id);

      logStreamer.append(id, 'system', `[Startup Updated] Runtime changed to ${newType} (v${newVersion}), Main=${newMain}`);

      return res.json({ message: 'Startup parameters updated successfully' });
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

      // Force kill process and release TCP port
      const appPort = app.port;
      await supervisor.killApp(id);
      if (appPort) {
        try {
          if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${appPort}`).toString();
            for (const line of out.split('\n')) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              if (pid && pid !== '0') execSync(`taskkill /pid ${pid} /F 2>nul`);
            }
          } else {
            execSync(`fuser -k -9 ${appPort}/tcp 2>/dev/null || true`);
            execSync(`kill -9 $(lsof -t -i:${appPort}) 2>/dev/null || true`);
          }
        } catch (e) {}
      }

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
        case 'kill': {
          const result = await supervisor.killApp(id);
          return res.json(result);
        }
        case 'install': {
          supervisor.installDependencies(id)
            .then(() => logStreamer.append(id, 'system', '[Daemon] Dependencies installation finished.'))
            .catch((err) => logStreamer.append(id, 'system', `[Daemon] Dependency installation failed: ${err.message}`));
          return res.json({ message: 'Dependency installation started in background. Monitor live logs.' });
        }
        default:
          return res.status(400).json({ error: `Unknown action: "${action}". Valid actions: start, stop, restart, kill, install` });
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

  static async getActivity(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT id, action, details, created_at, username FROM audit_logs WHERE details LIKE ? OR details LIKE ? OR action LIKE ? ORDER BY created_at DESC LIMIT 50');
      const param = '%' + id + '%';
      const logs = stmt.all(param, param, param);
      return res.json({ success: true, activity: logs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async setDomain(req, res) {
    try {
      const { id } = req.params;
      const { domain } = req.body;
      const cleanDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      db.prepare('UPDATE apps SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanDomain, id);
      return res.json({ success: true, domain: cleanDomain, message: 'Custom domain saved' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async verifyDomain(req, res) {
    try {
      const { id } = req.params;
      const { domain } = req.body;
      const targetDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!targetDomain) return res.status(400).json({ error: 'Domain is required' });

      let resolvedIps = [];
      let isVerified = false;

      try {
        const records = await dns.promises.resolve4(targetDomain);
        resolvedIps = records || [];
        isVerified = resolvedIps.length > 0;
      } catch (dnsErr) {
        // Fallback check: could be CNAME or localhost
        if (targetDomain === 'localhost' || targetDomain.endsWith('.local') || targetDomain.includes('127.0.0.1')) {
          isVerified = true;
          resolvedIps = ['127.0.0.1'];
        }
      }

      // Save domain if verified
      if (isVerified) {
        db.prepare('UPDATE apps SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetDomain, id);
      }

      return res.json({
        success: true,
        verified: isVerified,
        domain: targetDomain,
        resolvedIps,
        message: isVerified 
          ? `DNS verified successfully! Domain resolves to ${resolvedIps.join(', ')}`
          : `Could not resolve DNS records for ${targetDomain}. Please ensure your A or CNAME record has propagated.`
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

}
