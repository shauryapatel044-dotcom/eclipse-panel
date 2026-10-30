import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';
import { config } from '../config.js';

const execAsync = promisify(exec);

export class BackupController {
  // Ensure backup directory exists
  static getBackupDir(appId) {
    const backupDir = path.join(config.storageDir, 'backups', appId);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
  }

  // List backups for an app
  static async listBackups(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM app_backups WHERE app_id = ? ORDER BY created_at DESC');
      const backups = stmt.all(id);

      return res.json({ backups });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Create full snapshot backup (.tar.gz)
  static async createBackup(req, res) {
    try {
      const { id } = req.params;
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      // Check permission
      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const backupDir = BackupController.getBackupDir(id);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${app.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timestamp}.tar.gz`;
      const targetPath = path.join(backupDir, filename);

      // Execute tar creation excluding node_modules / .git if needed
      const cmd = `tar -czf "${targetPath}" --exclude='node_modules' --exclude='.git' -C "${appDir}" .`;
      await execAsync(cmd);

      const stats = fs.statSync(targetPath);
      const backupId = `bk_${crypto.randomBytes(4).toString('hex')}`;
      const notes = req.body.notes || 'Full Snapshot';

      db.prepare(`
        INSERT INTO app_backups (id, app_id, filename, size_bytes, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(backupId, id, filename, stats.size, notes);

      return res.status(201).json({
        message: 'Backup snapshot created successfully!',
        backup: {
          id: backupId,
          app_id: id,
          filename,
          size_bytes: stats.size,
          size_formatted: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          notes
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Download backup archive
  static async downloadBackup(req, res) {
    try {
      const { id, backupId } = req.params;
      const backup = db.prepare('SELECT * FROM app_backups WHERE id = ? AND app_id = ?').get(backupId, id);
      if (!backup) return res.status(404).json({ error: 'Backup not found' });

      const backupDir = BackupController.getBackupDir(id);
      const filePath = path.join(backupDir, backup.filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Backup archive file missing on disk' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
      res.setHeader('Content-Type', 'application/gzip');
      return res.sendFile(filePath);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Restore backup archive (overwrites app files and restarts)
  static async restoreBackup(req, res) {
    try {
      const { id, backupId } = req.params;
      const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const backup = db.prepare('SELECT * FROM app_backups WHERE id = ? AND app_id = ?').get(backupId, id);
      if (!backup) return res.status(404).json({ error: 'Backup record not found' });

      const backupDir = BackupController.getBackupDir(id);
      const archivePath = path.join(backupDir, backup.filename);
      const appDir = supervisor.getAppDir(id);

      // Stop server if running
      await supervisor.stopApp(id);

      // Extract archive over app directory
      const cmd = `tar -xzf "${archivePath}" -C "${appDir}"`;
      await execAsync(cmd);

      // Restart server
      await supervisor.startApp(id);

      return res.json({ message: `Snapshot "${backup.filename}" successfully restored and server restarted!` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Delete backup
  static async deleteBackup(req, res) {
    try {
      const { id, backupId } = req.params;
      const backup = db.prepare('SELECT * FROM app_backups WHERE id = ? AND app_id = ?').get(backupId, id);
      if (!backup) return res.status(404).json({ error: 'Backup not found' });

      const backupDir = BackupController.getBackupDir(id);
      const filePath = path.join(backupDir, backup.filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      db.prepare('DELETE FROM app_backups WHERE id = ?').run(backupId);
      return res.json({ message: 'Backup deleted successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
