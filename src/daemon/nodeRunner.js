import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { logStreamer } from './logStreamer.js';

export class NodeRunner {
  static installDependencies(appId, appDir) {
    return new Promise((resolve, reject) => {
      const packageJsonPath = path.join(appDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        logStreamer.append(appId, 'system', '[Daemon] No package.json found. Skipping npm install.');
        return resolve({ success: true, message: 'No package.json found' });
      }

      logStreamer.append(appId, 'system', '[Daemon] Executing npm install...');
      
      const child = spawn(config.npmBin, ['install', '--prefer-offline', '--no-audit'], {
        cwd: appDir,
        env: { ...process.env, NODE_ENV: 'production' },
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
          logStreamer.append(appId, 'system', '[Daemon] npm install completed successfully.');
          resolve({ success: true });
        } else {
          logStreamer.append(appId, 'system', `[Daemon] npm install failed with exit code ${code}.`);
          reject(new Error(`npm install failed with exit code ${code}`));
        }
      });

      child.on('error', (err) => {
        logStreamer.append(appId, 'system', `[Daemon] npm install error: ${err.message}`);
        reject(err);
      });
    });
  }

  static spawnProcess(app, appDir, customEnv = {}) {
    const entrypoint = app.entrypoint || 'index.js';
    const entrypointPath = path.join(appDir, entrypoint);

    if (!fs.existsSync(entrypointPath)) {
      throw new Error(`Entrypoint file "${entrypoint}" does not exist in application directory.`);
    }

    const env = {
      ...process.env,
      ...customEnv,
      PORT: app.port ? String(app.port) : process.env.PORT,
      NODE_ENV: customEnv.NODE_ENV || 'production',
      APP_ID: app.id,
      APP_NAME: app.name,
    };

    logStreamer.append(app.id, 'system', `[Daemon] Launching Node.js process: node ${entrypoint} (Port: ${app.port || 'Auto'})`);

    const child = spawn(config.nodeBin, [entrypoint], {
      cwd: appDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return child;
  }
}
