import path from 'path';
import fs from 'fs';
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
      if (app.type === 'nodejs') {
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
