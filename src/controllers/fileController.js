import path from 'path';
import fs from 'fs';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';

function isSafePath(baseDir, targetPath) {
  const resolved = path.resolve(baseDir, targetPath);
  return resolved.startsWith(path.resolve(baseDir));
}

export class FileController {
  static async listFiles(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const subpath = req.query.path || '';
      const targetDir = path.join(appDir, subpath);

      if (!isSafePath(appDir, targetDir) || !fs.existsSync(targetDir)) {
        return res.status(400).json({ error: 'Invalid directory path' });
      }

      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      const files = entries.map((entry) => {
        const full = path.join(targetDir, entry.name);
        const stat = fs.statSync(full);
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stat.size,
          updatedAt: stat.mtime,
          isIgnored: ['node_modules', 'venv', '.git', '__pycache__'].includes(entry.name),
        };
      });

      return res.json({ currentPath: subpath, files });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getFileContent(req, res) {
    try {
      const { id } = req.params;
      const filePath = req.query.file || req.query.path;
      if (!filePath) return res.status(400).json({ error: 'Query parameter "file" or "path" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);

      if (!isSafePath(appDir, fullPath) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const stat = fs.statSync(fullPath);
      if (stat.size > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large to edit in browser (limit 2MB)' });
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      return res.json({ file: filePath, content });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async saveFileContent(req, res) {
    try {
      const { id } = req.params;
      const file = req.body.file || req.body.path;
      const { content } = req.body;
      if (!file || content === undefined) {
        return res.status(400).json({ error: '"file" or "path" and "content" are required' });
      }

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, file);

      if (!isSafePath(appDir, fullPath)) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      // Ensure directory exists
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, 'utf8');
      return res.json({ message: `File "${file}" saved successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async deleteFile(req, res) {
    try {
      const { id } = req.params;
      const filePath = req.query.file;
      if (!filePath) return res.status(400).json({ error: 'Query parameter "file" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);

      if (!isSafePath(appDir, fullPath) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }

      return res.json({ message: `Deleted "${filePath}" successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async uploadFile(req, res) {
    try {
      const { id } = req.params;
      const { path: filePath, content, isBase64 } = req.body;
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'Parameters "path" and "content" are required' });
      }

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);
      if (!isSafePath(appDir, fullPath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (isBase64) {
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(fullPath, buffer);
      } else {
        fs.writeFileSync(fullPath, content, 'utf8');
      }

      return res.json({ message: `Uploaded "${filePath}" successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async createFile(req, res) {
    try {
      const { id } = req.params;
      const { path: filePath } = req.body;
      if (!filePath) return res.status(400).json({ error: 'Parameter "path" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);
      if (!isSafePath(appDir, fullPath)) return res.status(400).json({ error: 'Invalid file path' });

      if (fs.existsSync(fullPath)) {
        return res.status(400).json({ error: 'File already exists' });
      }

      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      fs.writeFileSync(fullPath, '', 'utf8');
      return res.json({ message: `File "${filePath}" created successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async createFolder(req, res) {
    try {
      const { id } = req.params;
      const { path: folderPath } = req.body;
      if (!folderPath) return res.status(400).json({ error: 'Parameter "path" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, folderPath);
      if (!isSafePath(appDir, fullPath)) return res.status(400).json({ error: 'Invalid folder path' });

      if (fs.existsSync(fullPath)) {
        return res.status(400).json({ error: 'Directory already exists' });
      }

      fs.mkdirSync(fullPath, { recursive: true });
      return res.json({ message: `Directory "${folderPath}" created successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async renameFile(req, res) {
    try {
      const { id } = req.params;
      const { oldPath, newPath } = req.body;
      if (!oldPath || !newPath) return res.status(400).json({ error: '"oldPath" and "newPath" are required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullOld = path.join(appDir, oldPath);
      const fullNew = path.join(appDir, newPath);

      if (!isSafePath(appDir, fullOld) || !isSafePath(appDir, fullNew)) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      if (!fs.existsSync(fullOld)) {
        return res.status(404).json({ error: 'Source file/folder does not exist' });
      }

      fs.renameSync(fullOld, fullNew);
      return res.json({ message: `Renamed "${oldPath}" to "${newPath}" successfully` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
