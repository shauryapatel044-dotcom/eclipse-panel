import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';

const execAsync = promisify(exec);

export class WebhookController {
  // Generate or regenerate deploy webhook token
  static async generateToken(req, res) {
    try {
      const { id } = req.params;
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      const token = `whk_${crypto.randomBytes(16).toString('hex')}`;
      db.prepare('UPDATE apps SET webhook_token = ? WHERE id = ?').run(token, id);

      return res.json({
        message: 'Git CI/CD webhook token generated successfully',
        webhook_token: token,
        webhook_url: `${req.protocol}://${req.get('host')}/api/apps/${id}/webhook?token=${token}`
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Handle incoming Git deploy webhook
  static async handleWebhook(req, res) {
    try {
      const { id } = req.params;
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      // Validate secret token from query param or headers
      const receivedToken = req.query.token || req.headers['x-webhook-secret'] || req.headers['x-hub-signature'];
      if (!app.webhook_token || receivedToken !== app.webhook_token) {
        return res.status(401).json({ error: 'Invalid or missing webhook authorization token' });
      }

      const appDir = supervisor.getAppDir(id);
      const isGitRepo = fs.existsSync(path.join(appDir, '.git'));

      let pullOutput = 'No .git directory found. Skipped git pull.';
      if (isGitRepo) {
        try {
          const { stdout } = await execAsync('git pull', { cwd: appDir, timeout: 30000 });
          pullOutput = stdout.trim();
        } catch (gitErr) {
          pullOutput = `Git pull warning: ${gitErr.message}`;
        }
      }

      // Check if dependencies should be updated
      if (app.type === 'nodejs' && fs.existsSync(path.join(appDir, 'package.json'))) {
        execAsync('npm install --omit=dev --no-audit', { cwd: appDir, timeout: 60000 }).catch(() => {});
      } else if (app.type === 'python' && fs.existsSync(path.join(appDir, 'requirements.txt'))) {
        execAsync('pip install -r requirements.txt', { cwd: appDir, timeout: 60000 }).catch(() => {});
      }

      // Restart application
      await supervisor.restartApp(id);

      // Record audit log
      try {
        db.prepare('INSERT INTO audit_logs (action, details, ip_address) VALUES (?, ?, ?)')
          .run('GIT_DEPLOY_WEBHOOK', `Automated deploy for ${app.name} (${id})`, req.ip || 'webhook');
      } catch (e) {}

      return res.json({
        success: true,
        message: `CI/CD Deploy triggered for "${app.name}". Application restarted.`,
        git_status: pullOutput,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
