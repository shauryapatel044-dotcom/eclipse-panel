import path from 'path';
import fs from 'fs';
import { spawn, exec, execSync } from 'child_process';
import { config } from '../config.js';
import { db } from '../database/index.js';
import { logStreamer } from './logStreamer.js';
import { NodeRunner } from './nodeRunner.js';
import { PythonRunner } from './pythonRunner.js';
import { estimateProcessMetrics } from './metrics.js';

function killProcessTree(pid, signal = 'SIGTERM') {
  if (!pid) return;
  const isWin = process.platform === 'win32';
  if (isWin) {
    try { execSync(`taskkill /pid ${pid} /T /F 2>nul`); } catch (e) {}
  } else {
    try {
      execSync(`pkill -${signal.replace('SIG', '')} -P ${pid} 2>/dev/null || true`);
      process.kill(pid, signal);
    } catch (e) {}
  }
}

function freeAppPort(port) {
  if (!port) return;
  const isWin = process.platform === 'win32';
  if (isWin) {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = out.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') execSync(`taskkill /pid ${pid} /F 2>nul`);
      }
    } catch (e) {}
  } else {
    try {
      execSync(`fuser -k -9 ${port}/tcp 2>/dev/null || true`);
    } catch (e) {}
  }
}

class Supervisor {
  constructor() {
    // Map of appId -> { childProcess, startTime, restartCount, manualStop: boolean }
    this.managedProcesses = new Map();
    // Map of appId -> { rapidCrashCount: number, firstCrashTime: number }
    this.crashCounters = new Map();
  }

  getAppDir(appId) {
    const dir = path.join(config.appsDir, appId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  spawnStartupProcess(app, appDir, customEnv = {}) {
    const isWin = process.platform === 'win32';
    const mainFile = app.main_file || app.entrypoint || (app.type === 'python' ? 'main.py' : 'index.js');
    const nodePackages = app.node_packages || '';
    const unnodePackages = app.unnode_packages || '';
    const nodeArgs = app.node_args || '';
    const reqFile = app.requirements_file || 'requirements.txt';

    // Ensure the entrypoint file exists in appDir if missing
    const entryPath = path.join(appDir, mainFile);
    if (!fs.existsSync(entryPath)) {
      if (app.type === 'python') {
        fs.writeFileSync(entryPath, `# Starter Python Application - Eclipse Panel\nimport os, sys\nfrom http.server import HTTPServer, BaseHTTPRequestHandler\n\nPORT = int(os.environ.get('PORT', 3000))\n\nclass SimpleHandler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.send_header('Content-type', 'application/json')\n        self.end_headers()\n        self.wfile.write(b'{"status":"online","server":"Eclipse Panel Python"}\\n')\n    def log_message(self, format, *args):\n        sys.stdout.write(f"[%s] %s\\n" % (self.log_date_time_string(), format%args))\n        sys.stdout.flush()\n\nprint(f"[Python] Server listening on port {PORT}...")\nsys.stdout.flush()\nserver = HTTPServer(('0.0.0.0', PORT), SimpleHandler)\nserver.serve_forever()\n`);
      } else {
        fs.writeFileSync(entryPath, `// Starter Node.js Application - Eclipse Panel\nimport http from 'http';\n\nconst PORT = process.env.PORT || 3000;\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ status: 'online', server: 'Eclipse Panel Node.js' }) + '\\n');\n});\n\nserver.listen(PORT, '0.0.0.0', () => {\n  console.log(\`[Node.js] Server listening on port \\\${PORT}...\`);\n});\n`);
      }
    }

    const env = {
      ...process.env,
      ...customEnv,
      PORT: app.port ? String(app.port) : '3000',
      MAIN_FILE: mainFile,
      NODE_PACKAGES: nodePackages,
      UNNODE_PACKAGES: unnodePackages,
      NODE_ARGS: nodeArgs,
      REQUIREMENTS_FILE: reqFile,
      APP_ID: app.id,
      APP_NAME: app.name,
    };

    if (app.memory_limit && parseInt(app.memory_limit, 10) > 0) {
      env.NODE_OPTIONS = (env.NODE_OPTIONS || '') + ` --max-old-space-size=${parseInt(app.memory_limit, 10)}`;
    }

    let rawCmd = (app.startup_cmd || '').trim();
    let pyBin = config.pythonBin || 'python';

    // Smart Normalization: Translate Pterodactyl container-only paths to host
    let normalizedCmd = rawCmd
      .replace(/\/home\/container\//g, './')
      .replace(/\/home\/container\b/g, '.')
      .replace(/\/usr\/local\/bin\/python\b/g, pyBin)
      .replace(/\/usr\/bin\/python3?\b/g, pyBin)
      .replace(/\/usr\/local\/bin\/node\b/g, 'node')
      .replace(/\/usr\/bin\/node\b/g, 'node')
      .replace(/\/usr\/local\/bin\/npm\b/g, 'npm')
      .replace(/\/usr\/bin\/npm\b/g, 'npm')
      .replace(/\/usr\/local\/bin\/ts-node\b/g, 'ts-node');

    // If normalizedCmd is empty or looks like broken bash script on Windows, use clean fallback
    if (isWin && (normalizedCmd.includes('if [[') || normalizedCmd.includes('fi;'))) {
      if (app.type === 'nodejs') normalizedCmd = `node ${mainFile}`;
      else if (app.type === 'python') normalizedCmd = `${pyBin} ${mainFile}`;
      else if (app.type === 'java') normalizedCmd = `java -jar ${mainFile}`;
      else if (app.type === 'bun') normalizedCmd = `bun run ${mainFile}`;
      else if (app.type === 'go') normalizedCmd = `go run ${mainFile}`;
      else normalizedCmd = `./${mainFile}`;
    }

    if (normalizedCmd) {
      logStreamer.append(app.id, 'system', `[Supervisor] Spawning startup command: ${normalizedCmd}`);
      return spawn(normalizedCmd, {
        cwd: appDir,
        env,
        shell: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    // Direct native runner fallback
    logStreamer.append(app.id, 'system', `[Supervisor] Launching native ${app.type} runner...`);
    if (app.type === 'nodejs') {
      return NodeRunner.spawnProcess(app, appDir, customEnv);
    } else {
      return PythonRunner.spawnProcess(app, appDir, customEnv);
    }
  }

  async startApp(appId) {
    const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
    const app = stmt.get(appId);
    if (!app) {
      throw new Error(`Application with ID "${appId}" not found`);
    }

    // If already running, do nothing
    if (this.isRunning(appId)) {
      return { success: true, message: 'Application is already running' };
    }

    const appDir = this.getAppDir(appId);
    let parsedEnv = {};
    try {
      parsedEnv = JSON.parse(app.env_vars || '{}');
    } catch (e) {
      parsedEnv = {};
    }

    // Update status in DB
    this.updateAppStatus(appId, 'starting');
    this.crashCounters.delete(appId);

    // Ensure port is completely freed before spawning
    if (app.port) {
      freeAppPort(app.port);
    }

    let child = null;
    try {
      if (app.startup_cmd && app.startup_cmd.trim()) {
        child = this.spawnStartupProcess(app, appDir, parsedEnv);
      } else if (app.type === 'nodejs') {
        child = NodeRunner.spawnProcess(app, appDir, parsedEnv);
      } else if (app.type === 'python') {
        child = PythonRunner.spawnProcess(app, appDir, parsedEnv);
      } else {
        throw new Error(`Unsupported application type: ${app.type}`);
      }
    } catch (err) {
      this.updateAppStatus(appId, 'error');
      logStreamer.append(appId, 'system', `[Supervisor Error] Failed to start: ${err.message}`);
      throw err;
    }

    const processRecord = {
      child,
      startTime: Date.now(),
      restartCount: 0,
      manualStop: false,
    };
    this.managedProcesses.set(appId, processRecord);
    this.updateAppStatus(appId, 'running');

    // Attach Output Streams
    child.stdout.on('data', (chunk) => {
      logStreamer.append(appId, 'stdout', chunk.toString());
    });

    child.stderr.on('data', (chunk) => {
      logStreamer.append(appId, 'stderr', chunk.toString());
    });

    child.on('close', (code, signal) => {
      const record = this.managedProcesses.get(appId);
      const isManual = record ? record.manualStop : false;
      const uptimeMs = record ? (Date.now() - record.startTime) : 0;
      this.managedProcesses.delete(appId);

      logStreamer.append(appId, 'system', `[Process Closed] Exit code: ${code}, Signal: ${signal || 'none'}`);

      if (isManual) {
        this.updateAppStatus(appId, 'stopped');
        this.crashCounters.delete(appId);
      } else {
        // Unexpected crash
        this.updateAppStatus(appId, 'error');

        // Crash guard: detect rapid crash loops (exiting under 3.5 seconds)
        let crashInfo = this.crashCounters.get(appId) || { count: 0, firstCrashTime: Date.now() };
        if (uptimeMs < 3500) {
          crashInfo.count += 1;
          this.crashCounters.set(appId, crashInfo);
        } else {
          // Process ran normally for a while, reset rapid crash counter
          this.crashCounters.delete(appId);
        }

        if (crashInfo.count >= 4) {
          logStreamer.append(
            appId, 
            'system', 
            `[Supervisor Crash Guard] Detected ${crashInfo.count} consecutive rapid crashes. Auto-restart loop halted to prevent resource exhaustion. Please check your command, dependencies, or code, then click Start manually.`
          );
          this.updateAppStatus(appId, 'crashed');
          this.crashCounters.delete(appId);
          return;
        }

        if (app.auto_restart) {
          logStreamer.append(appId, 'system', `[Supervisor] Unexpected termination. Auto-restart in 3 seconds (${crashInfo.count}/4)...`);
          setTimeout(() => {
            if (!this.managedProcesses.has(appId)) {
              this.startApp(appId).catch((e) => {
                logStreamer.append(appId, 'system', `[Auto-restart Failed] ${e.message}`);
              });
            }
          }, 3000);
        }
      }
    });

    child.on('error', (err) => {
      logStreamer.append(appId, 'system', `[Process Error] ${err.message}`);
      this.updateAppStatus(appId, 'error');
    });

    return { success: true, message: 'Application started successfully', pid: child.pid };
  }

  async stopApp(appId) {
    const record = this.managedProcesses.get(appId);
    let appRecord = null;
    try { appRecord = db.prepare('SELECT port FROM apps WHERE id = ?').get(appId); } catch (e) {}

    if (!record || !record.child) {
      if (appRecord && appRecord.port) freeAppPort(appRecord.port);
      this.updateAppStatus(appId, 'stopped');
      return { success: true, message: 'Application was not running' };
    }

    record.manualStop = true;
    const { child } = record;
    logStreamer.append(appId, 'system', '[Supervisor] Stopping process gracefully...');

    return new Promise((resolve) => {
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        this.managedProcesses.delete(appId);
        if (appRecord && appRecord.port) freeAppPort(appRecord.port);
        this.updateAppStatus(appId, 'stopped');
        this.crashCounters.delete(appId);
        resolve({ success: true, message: 'Application stopped' });
      };

      const forceKillTimer = setTimeout(() => {
        if (!resolved && child.pid) {
          logStreamer.append(appId, 'system', '[Supervisor] Process did not terminate in time. Force killing...');
          killProcessTree(child.pid, 'SIGKILL');
          if (appRecord && appRecord.port) freeAppPort(appRecord.port);
        }
        finish();
      }, 2000);

      child.once('close', () => {
        clearTimeout(forceKillTimer);
        finish();
      });

      killProcessTree(child.pid, 'SIGTERM');
    });
  }

  async killApp(appId) {
    const record = this.managedProcesses.get(appId);
    let appRecord = null;
    try { appRecord = db.prepare('SELECT port FROM apps WHERE id = ?').get(appId); } catch (e) {}

    if (record && record.child && record.child.pid) {
      record.manualStop = true;
      logStreamer.append(appId, 'system', '[Supervisor] Force-killing process immediately (SIGKILL)...');
      killProcessTree(record.child.pid, 'SIGKILL');
    }

    if (appRecord && appRecord.port) {
      freeAppPort(appRecord.port);
    }

    this.managedProcesses.delete(appId);
    this.updateAppStatus(appId, 'stopped');
    this.crashCounters.delete(appId);
    return { success: true, message: 'Application process killed immediately' };
  }

  async restartApp(appId) {
    logStreamer.append(appId, 'system', '[Supervisor] Restarting application...');
    await this.stopApp(appId);
    let appRecord = null;
    try { appRecord = db.prepare('SELECT port FROM apps WHERE id = ?').get(appId); } catch (e) {}
    if (appRecord && appRecord.port) {
      freeAppPort(appRecord.port);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    return await this.startApp(appId);
  }

  async installDependencies(appId) {
    const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
    const app = stmt.get(appId);
    if (!app) throw new Error('Application not found');

    const appDir = this.getAppDir(appId);
    this.updateAppStatus(appId, 'installing');
    try {
      let res;
      if (app.type === 'nodejs') {
        res = await NodeRunner.installDependencies(appId, appDir);
      } else if (app.type === 'python') {
        res = await PythonRunner.installDependencies(appId, appDir);
      }
      this.updateAppStatus(appId, 'stopped');
      return res;
    } catch (err) {
      this.updateAppStatus(appId, 'error');
      throw err;
    }
  }

  async sendCommand(appId, commandStr) {
    const trimmed = (commandStr || '').trim();
    if (!trimmed) return { success: false, message: 'Empty command' };

    logStreamer.append(appId, 'system', `> ${trimmed}`);

    const record = this.managedProcesses.get(appId);
    if (record && record.child && record.child.stdin && record.child.stdin.writable) {
      try {
        record.child.stdin.write(trimmed + '\n');
        return { success: true, message: 'Command sent to process stdin' };
      } catch (e) {
        logStreamer.append(appId, 'stderr', `Failed to write to stdin: ${e.message}`);
      }
    }

    // Execute command in app environment/workspace
    const appDir = this.getAppDir(appId);
    const { spawn } = await import('child_process');
    const isWin = process.platform === 'win32';

    return new Promise((resolve) => {
      const proc = spawn(isWin ? 'cmd.exe' : '/bin/sh', [isWin ? '/c' : '-c', trimmed], {
        cwd: appDir,
        env: { ...process.env },
      });

      proc.stdout.on('data', (d) => logStreamer.append(appId, 'stdout', d.toString()));
      proc.stderr.on('data', (d) => logStreamer.append(appId, 'stderr', d.toString()));

      proc.on('close', (code) => {
        logStreamer.append(appId, 'system', `[Execution Finished] Exit code: ${code}`);
        resolve({ success: true, code });
      });

      proc.on('error', (err) => {
        logStreamer.append(appId, 'stderr', `Command execution error: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  isRunning(appId) {
    const record = this.managedProcesses.get(appId);
    return !!(record && record.child && !record.child.killed);
  }

  getMetrics(appId) {
    const record = this.managedProcesses.get(appId);
    if (!record) {
      return { running: false, pid: null, uptimeSeconds: 0 };
    }
    return estimateProcessMetrics(record.child, record.startTime);
  }

  updateAppStatus(appId, status) {
    try {
      const stmt = db.prepare('UPDATE apps SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.run(status, appId);
    } catch (e) {
      console.error(`[DB Error updating status]: ${e.message}`);
    }
  }

  async bootAllAutoStartApps() {
    if (!config.autoStartOnBoot) return;
    try {
      const stmt = db.prepare('SELECT id, name, auto_restart FROM apps WHERE auto_restart = 1');
      const apps = stmt.all();
      console.log(`[Supervisor] Checking ${apps.length} apps set for auto-start...`);
      for (const app of apps) {
        console.log(`[Supervisor] Auto-starting ${app.name} (${app.id})...`);
        this.startApp(app.id).catch((err) => {
          console.error(`[Supervisor] Failed to auto-start ${app.id}: ${err.message}`);
        });
      }
    } catch (e) {
      console.error(`[Supervisor] Auto-start check failed: ${e.message}`);
    }
  }
}

export const supervisor = new Supervisor();
