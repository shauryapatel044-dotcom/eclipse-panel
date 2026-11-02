import { exec, spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { db } from '../database/index.js';
import { config } from '../config.js';

class AutoDeployService {
  constructor() {
    this.intervalId = null;
    this.isDeploying = false;
    this.currentCommit = '';
    this.remoteCommit = '';
    this.currentCommitMsg = '';
    this.remoteCommitMsg = '';
    this.lastCheck = null;
    this.lastDeploy = null;
    this.lastError = null;
    this.pollIntervalMs = 60 * 1000; // default 60s
    this.enabled = true;
    this.webhookSecret = '';
  }

  // Load configuration from database
  loadSettings() {
    try {
      const enabledRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'autodeploy_enabled'").get();
      const intervalRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'autodeploy_interval_sec'").get();
      let secretRow = db.prepare("SELECT value FROM panel_settings WHERE key = 'autodeploy_webhook_secret'").get();

      // If no secret generated yet, create a secure random secret
      if (!secretRow || !secretRow.value || secretRow.value.trim().length === 0) {
        const generatedSecret = crypto.randomBytes(20).toString('hex');
        db.prepare("INSERT INTO panel_settings (key, value) VALUES ('autodeploy_webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(generatedSecret);
        secretRow = { value: generatedSecret };
      }

      this.enabled = enabledRow ? enabledRow.value === '1' : true; // Default ON
      const intervalSec = intervalRow ? parseInt(intervalRow.value, 10) || 60 : 60;
      this.pollIntervalMs = Math.max(15, intervalSec) * 1000;
      this.webhookSecret = secretRow.value;

      return {
        enabled: this.enabled,
        intervalSec,
        webhookSecret: this.webhookSecret
      };
    } catch (e) {
      console.error('[AutoDeploy] Error loading settings:', e.message);
      return { enabled: true, intervalSec: 60, webhookSecret: 'eclipse_autodeploy_secret' };
    }
  }

  // Save settings to database
  saveSettings({ enabled, intervalSec }) {
    if (enabled !== undefined) {
      db.prepare("INSERT INTO panel_settings (key, value) VALUES ('autodeploy_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(enabled ? '1' : '0');
      this.enabled = Boolean(enabled);
    }
    if (intervalSec !== undefined) {
      const sec = Math.max(15, parseInt(intervalSec, 10) || 60);
      db.prepare("INSERT INTO panel_settings (key, value) VALUES ('autodeploy_interval_sec', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(String(sec));
      this.pollIntervalMs = sec * 1000;
    }

    // Re-initialize interval timer
    this.restartPoller();
    return this.getStatus();
  }

  // Initialize background poller
  async init() {
    this.loadSettings();
    await this.getCurrentLocalCommit();
    this.restartPoller();
  }

  // Restart or stop polling timer
  restartPoller() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.enabled) {
      console.log(`[AutoDeploy] 🚀 Continuous Deployment Active (Checking for updates every ${this.pollIntervalMs / 1000}s)`);
      // Initial check after 8s delay
      setTimeout(() => this.checkForUpdates().catch(() => {}), 8000);
      this.intervalId = setInterval(() => this.checkForUpdates().catch(() => {}), this.pollIntervalMs);
    } else {
      console.log('[AutoDeploy] ⏸️ Continuous Deployment Poller is currently disabled.');
    }
  }

  // Get current local commit hash and message
  getCurrentLocalCommit() {
    const projectRoot = config.rootDir || process.cwd();
    return new Promise((resolve) => {
      exec('git rev-parse HEAD', { cwd: projectRoot }, (err, stdout) => {
        if (!err && stdout) {
          this.currentCommit = stdout.trim();
        }
        exec('git log -1 --format="%s"', { cwd: projectRoot }, (err2, stdout2) => {
          if (!err2 && stdout2) {
            this.currentCommitMsg = stdout2.trim();
          }
          resolve({ commit: this.currentCommit, message: this.currentCommitMsg });
        });
      });
    });
  }

  // Check remote release commit vs local
  checkForUpdates() {
    if (this.isDeploying) {
      return Promise.resolve({ isDeploying: true, message: 'Deployment currently executing' });
    }

    return new Promise((resolve) => {
      this.lastCheck = new Date().toISOString();
      const projectRoot = config.rootDir || process.cwd();

      exec('git ls-remote origin refs/heads/main', { cwd: projectRoot, timeout: 15000 }, async (err, stdout) => {
        if (err || !stdout) {
          this.lastError = err ? err.message : 'No response from git ls-remote';
          return resolve({
            hasUpdate: false,
            error: this.lastError,
            currentCommit: this.currentCommit,
            remoteCommit: this.remoteCommit
          });
        }

        const match = stdout.trim().split(/\s+/);
        const remoteHash = match[0] || '';
        this.remoteCommit = remoteHash;
        await this.getCurrentLocalCommit();

        const hasUpdate = Boolean(remoteHash && this.currentCommit && remoteHash !== this.currentCommit);

        if (hasUpdate && this.enabled) {
          console.log(`[AutoDeploy] ⚡ New core update detected (${remoteHash.slice(0, 7)} vs local ${this.currentCommit.slice(0, 7)}). Auto-deploying...`);
          const deployRes = await this.deployUpdate('auto_poller');
          return resolve({
            hasUpdate: true,
            currentCommit: this.currentCommit,
            remoteCommit: this.remoteCommit,
            autoDeployed: true,
            deployResult: deployRes
          });
        }

        this.lastError = null;
        resolve({
          hasUpdate,
          currentCommit: this.currentCommit,
          remoteCommit: this.remoteCommit,
          currentCommitMsg: this.currentCommitMsg,
          isUpToDate: !hasUpdate
        });
      });
    });
  }

  // Deploy update & restart daemon
  async deployUpdate(triggerSource = 'manual') {
    if (this.isDeploying) {
      return { success: false, message: 'Deployment already in progress' };
    }

    this.isDeploying = true;
    console.log(`[AutoDeploy] 🚀 Initiating deployment (Trigger: ${triggerSource})...`);

    const projectRoot = config.rootDir || process.cwd();

    return new Promise((resolve) => {
      // Step 1: git fetch, hard reset to origin/main, install any new dependencies
      const updateCmd = 'git fetch origin main && git reset --hard origin/main && npm install --omit=dev --no-audit';

      exec(updateCmd, { cwd: projectRoot, timeout: 90000 }, (err, stdout, stderr) => {
        if (err) {
          this.isDeploying = false;
          this.lastError = `Update failed: ${err.message}`;
          console.error('[AutoDeploy Error]:', this.lastError);
          return resolve({ success: false, error: this.lastError });
        }

        this.lastDeploy = new Date().toISOString();
        this.isDeploying = false;
        console.log('[AutoDeploy] ✅ Files updated and dependencies installed successfully.');

        // Record audit log entry
        try {
          db.prepare('INSERT INTO audit_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)')
            .run(1, 'AutoDeploy', 'system_update', `Deployed latest core update (Trigger: ${triggerSource})`, '127.0.0.1');
        } catch (e) {}

        // Step 2: Trigger service restart
        if (process.platform === 'linux') {
          console.log('[AutoDeploy] 🔄 Triggering daemon restart via systemd...');
          spawn('bash', ['-c', 'sleep 1 && systemctl restart eclipse-panel'], {
            detached: true,
            stdio: 'ignore'
          }).unref();
        }

        resolve({
          success: true,
          message: 'Codebase updated to latest release. Daemon restarting...',
          output: stdout
        });
      });
    });
  }

  // Validate Webhook Signature or Query Secret
  verifyWebhook(req) {
    this.loadSettings();

    // 1. Direct secret token verification (via ?secret=xyz or x-webhook-secret header)
    const token = req.query.secret || req.headers['x-webhook-secret'];
    if (token && token.trim() === this.webhookSecret.trim()) {
      return true;
    }

    // 2. HMAC SHA256 signature verification (x-hub-signature-256)
    const signature = req.headers['x-hub-signature-256'];
    if (signature && req.rawBody) {
      try {
        const hmac = crypto.createHmac('sha256', this.webhookSecret);
        const digest = `sha256=${hmac.update(req.rawBody).digest('hex')}`;
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
      } catch (e) {
        return false;
      }
    }

    return false;
  }

  // Comprehensive Status for API & UI
  getStatus() {
    this.loadSettings();
    const isUpToDate = Boolean(this.currentCommit && this.remoteCommit && this.currentCommit === this.remoteCommit);
    const host = config.panelDomain || config.vpsPublicIp || '20.219.198.128';

    return {
      enabled: this.enabled,
      isDeploying: this.isDeploying,
      currentCommit: this.currentCommit,
      currentCommitShort: this.currentCommit ? this.currentCommit.slice(0, 7) : '',
      currentCommitMsg: this.currentCommitMsg,
      remoteCommit: this.remoteCommit,
      remoteCommitShort: this.remoteCommit ? this.remoteCommit.slice(0, 7) : '',
      isUpToDate,
      hasUpdate: Boolean(this.remoteCommit && this.currentCommit && this.remoteCommit !== this.currentCommit),
      lastCheck: this.lastCheck,
      lastDeploy: this.lastDeploy,
      lastError: this.lastError,
      pollIntervalSec: this.pollIntervalMs / 1000,
      webhookUrl: `https://${host}/api/deploy/webhook?secret=${this.webhookSecret}`,
      webhookSecret: this.webhookSecret
    };
  }
}

export const autoDeployService = new AutoDeployService();
