import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { config } from '../config.js';
import { db } from '../database/index.js';
import { logStreamer } from './logStreamer.js';
import { NodeRunner } from './nodeRunner.js';
import { PythonRunner } from './pythonRunner.js';
import { estimateProcessMetrics } from './metrics.js';

class Supervisor {
  constructor() {
    // Map of appId -> { childProcess, startTime, restartCount, manualStop: boolean }
    this.managedProcesses = new Map();
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

    let cmdStr = app.startup_cmd || '';
    
    // Check if on Linux or /bin/bash is available
    if (!isWin && fs.existsSync('/bin/bash')) {
      logStreamer.append(app.id, 'system', `[Supervisor] Spawning bash startup script...`);
      return spawn('/bin/bash', ['-c', cmdStr], {
        cwd: appDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    // Windows with Git Bash check
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    if (isWin && fs.existsSync(gitBash)) {
      logStreamer.append(app.id, 'system', `[Supervisor] Spawning bash startup script via Git Bash...`);
      return spawn(gitBash, ['-c', cmdStr], {
        cwd: appDir,
        env,
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
      this.managedProcesses.delete(appId);

      logStreamer.append(appId, 'system', `[Process Closed] Exit code: ${code}, Signal: ${signal || 'none'}`);

      if (isManual) {
        this.updateAppStatus(appId, 'stopped');
      } else {
        // Unexpected crash
        this.updateAppStatus(appId, 'error');
        if (app.auto_restart) {
          logStreamer.append(appId, 'system', '[Supervisor] Unexpected termination. Auto-restart in 3 seconds...');
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
    if (!record || !record.child) {
      this.updateAppStatus(appId, 'stopped');
      return { success: true, message: 'Application was not running' };
    }

    record.manualStop = true;
    const { child } = record;

    logStreamer.append(appId, 'system', '[Supervisor] Stopping process gracefully (SIGTERM)...');

    return new Promise((resolve) => {
      let killed = false;
      const killTimer = setTimeout(() => {
        if (!killed && child.pid) {
          logStreamer.append(appId, 'system', '[Supervisor] Forcefully terminating (SIGKILL)...');
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch (e) {}
        }
      }, 3000);

      child.once('close', () => {
        killed = true;
        clearTimeout(killTimer);
        this.managedProcesses.delete(appId);
        this.updateAppStatus(appId, 'stopped');
        resolve({ success: true, message: 'Application stopped' });
      });

      try {
        child.kill('SIGTERM');
      } catch (e) {
        this.managedProcesses.delete(appId);
        this.updateAppStatus(appId, 'stopped');
        resolve({ success: true, message: 'Application process killed' });
      }
    });
  }

  async restartApp(appId) {
    logStreamer.append(appId, 'system', '[Supervisor] Restarting application...');
    await this.stopApp(appId);
    return await this.startApp(appId);
  }

  async installDependencies(appId) {
    const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
    const app = stmt.get(appId);
    if (!app) throw new Error('Application not found');

    const appDir = this.getAppDir(appId);
    if (app.type === 'nodejs') {
      return await NodeRunner.installDependencies(appId, appDir);
    } else if (app.type === 'python') {
      return await PythonRunner.installDependencies(appId, appDir);
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
