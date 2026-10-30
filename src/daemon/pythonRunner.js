import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { logStreamer } from './logStreamer.js';

export class PythonRunner {
  static getVenvPythonPath(appDir) {
    const isWin = process.platform === 'win32';
    const venvPython = isWin
      ? path.join(appDir, 'venv', 'Scripts', 'python.exe')
      : path.join(appDir, 'venv', 'bin', 'python');
    
    const venvPip = isWin
      ? path.join(appDir, 'venv', 'Scripts', 'pip.exe')
      : path.join(appDir, 'venv', 'bin', 'pip');

    return {
      hasVenv: fs.existsSync(venvPython),
      pythonPath: fs.existsSync(venvPython) ? venvPython : config.pythonBin,
      pipPath: fs.existsSync(venvPip) ? venvPip : 'pip',
    };
  }

  static async setupVenvIfNeeded(appId, appDir) {
    const { hasVenv } = this.getVenvPythonPath(appDir);
    if (hasVenv) return;

    logStreamer.append(appId, 'system', '[Daemon] Initializing isolated Python venv...');
    return new Promise((resolve) => {
      const child = spawn(config.pythonBin, ['-m', 'venv', 'venv'], {
        cwd: appDir,
      });

      child.on('close', (code) => {
        if (code === 0) {
          logStreamer.append(appId, 'system', '[Daemon] Python venv created.');
        } else {
          logStreamer.append(appId, 'system', `[Daemon] Notice: Could not create venv (code ${code}), falling back to system python.`);
        }
        resolve();
      });

      child.on('error', () => {
        logStreamer.append(appId, 'system', '[Daemon] Fallback: using system python.');
        resolve();
      });
    });
  }

  static async installDependencies(appId, appDir) {
    await this.setupVenvIfNeeded(appId, appDir);
    const requirementsPath = path.join(appDir, 'requirements.txt');

    if (!fs.existsSync(requirementsPath)) {
      logStreamer.append(appId, 'system', '[Daemon] No requirements.txt found. Skipping pip install.');
      return { success: true, message: 'No requirements.txt found' };
    }

    const { pipPath } = this.getVenvPythonPath(appDir);
    logStreamer.append(appId, 'system', `[Daemon] Installing Python packages with ${pipPath}...`);

    return new Promise((resolve, reject) => {
      const child = spawn(pipPath, ['install', '-r', 'requirements.txt', '--no-cache-dir'], {
        cwd: appDir,
        shell: process.platform === 'win32',
      });

      child.stdout.on('data', (data) => {
        logStreamer.append(appId, 'stdout', data.toString());
      });

      child.stderr.on('data', (data) => {
        logStreamer.append(appId, 'stderr', data.toString());
      });

      child.on('close', (code) => {
        if (code === 0) {
          logStreamer.append(appId, 'system', '[Daemon] pip install completed successfully.');
          resolve({ success: true });
        } else {
          logStreamer.append(appId, 'system', `[Daemon] pip install failed with exit code ${code}.`);
          reject(new Error(`pip install exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        logStreamer.append(appId, 'system', `[Daemon] pip error: ${err.message}`);
        reject(err);
      });
    });
  }

  static spawnProcess(app, appDir, customEnv = {}) {
    const entrypoint = app.entrypoint || 'main.py';
    const entrypointPath = path.join(appDir, entrypoint);

    if (!fs.existsSync(entrypointPath)) {
      throw new Error(`Entrypoint file "${entrypoint}" does not exist in application directory.`);
    }

    const { pythonPath } = this.getVenvPythonPath(appDir);

    const env = {
      ...process.env,
      ...customEnv,
      PYTHONUNBUFFERED: '1', // Ensure immediate flush of stdout/stderr
      PORT: app.port ? String(app.port) : process.env.PORT,
      APP_ID: app.id,
      APP_NAME: app.name,
    };

    logStreamer.append(app.id, 'system', `[Daemon] Launching Python process: ${pythonPath} ${entrypoint} (Port: ${app.port || 'Auto'})`);

    const child = spawn(pythonPath, [entrypoint], {
      cwd: appDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return child;
  }
}
