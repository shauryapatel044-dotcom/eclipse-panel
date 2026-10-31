import path from 'path';
import fs from 'fs';
import { db } from '../database/index.js';
import { supervisor } from '../daemon/supervisor.js';
import { checkAppAccess } from '../utils/permissions.js';

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

      if (!checkAppAccess(id, req.user, 'files')) {
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

      // Sort directories first, then alphabetical
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
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

      if (!checkAppAccess(id, req.user, 'files')) {
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

      if (!checkAppAccess(id, req.user, 'files')) {
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
      const filePath = req.query.file || (req.body && (req.body.file || req.body.path || req.body.filePath));
      if (!filePath) return res.status(400).json({ error: 'Parameter "file" or "path" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
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

      if (!checkAppAccess(id, req.user, 'files')) {
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

      // Check server disk quota limit (Allow uploading up to the server container disk quota)
      const diskLimitMB = app.disk_limit || 5120;
      const diskLimitBytes = diskLimitMB * 1024 * 1024;
      const incomingBytes = isBase64 ? Buffer.byteLength(content, 'base64') : Buffer.byteLength(content, 'utf8');

      function getFolderSize(dir) {
        let size = 0;
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const p = path.join(dir, file);
            try {
              const stat = fs.statSync(p);
              if (stat.isDirectory()) size += getFolderSize(p);
              else size += stat.size;
            } catch (e) {}
          }
        } catch (e) {}
        return size;
      }

      const currentUsage = getFolderSize(appDir);
      if (currentUsage + incomingBytes > diskLimitBytes) {
        const usedMB = (currentUsage / (1024 * 1024)).toFixed(1);
        const incomingMB = (incomingBytes / (1024 * 1024)).toFixed(1);
        return res.status(400).json({
          error: `Disk quota exceeded: Container limit is ${diskLimitMB}MB. Current usage is ${usedMB}MB and this file is ${incomingMB}MB.`
        });
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

  static async unarchiveFile(req, res) {
    try {
      const { id } = req.params;
      const filePath = req.body.path || req.body.filePath;
      if (!filePath) return res.status(400).json({ error: 'Parameter "path" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);
      if (!isSafePath(appDir, fullPath) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Archive file not found' });
      }

      const targetDir = path.dirname(fullPath);
      const lower = fullPath.toLowerCase();

      const { execSync } = await import('child_process');
      const isWin = process.platform === 'win32';
      const pyBin = process.env.PYTHON_BIN || (isWin ? 'python' : 'python3');

      if (lower.endsWith('.zip') || lower.endsWith('.jar')) {
        try {
          execSync(`"${pyBin}" -m zipfile -e "${fullPath}" "${targetDir}"`, { timeout: 180000 });
        } catch (e) {
          if (!isWin) {
            execSync(`unzip -o "${fullPath}" -d "${targetDir}"`, { timeout: 180000 });
          } else {
            throw e;
          }
        }
      } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar') || lower.endsWith('.gz')) {
        execSync(`tar -xf "${fullPath}" -C "${targetDir}"`, { timeout: 180000 });
      } else if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.bz2')) {
        execSync(`tar -xf "${fullPath}" -C "${targetDir}"`, { timeout: 180000 });
      } else if (lower.endsWith('.tar.xz') || lower.endsWith('.txz') || lower.endsWith('.xz')) {
        execSync(`tar -xf "${fullPath}" -C "${targetDir}"`, { timeout: 180000 });
      } else if (lower.endsWith('.rar')) {
        execSync(`unrar x -o+ "${fullPath}" "${targetDir}"`, { timeout: 180000 });
      } else if (lower.endsWith('.7z')) {
        execSync(`7z x -y "${fullPath}" -o"${targetDir}"`, { timeout: 180000 });
      } else {
        return res.status(400).json({ error: 'Unsupported archive format. Supported formats: .zip, .tar, .tar.gz, .tgz, .bz2, .xz, .jar, .rar, .7z' });
      }

      return res.json({ message: `Archive "${filePath}" extracted successfully` });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to extract archive: ' + err.message });
    }
  }

  static async createFile(req, res) {
    try {
      const { id } = req.params;
      const filePath = req.body.path || req.body.filePath;
      if (!filePath) return res.status(400).json({ error: 'Parameter "path" or "filePath" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
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

      if (!checkAppAccess(id, req.user, 'files')) {
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

      if (!checkAppAccess(id, req.user, 'files')) {
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

  static async downloadFile(req, res) {
    try {
      const { id } = req.params;
      const filePath = req.query.file;
      if (!filePath) return res.status(400).json({ error: 'Query parameter "file" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);

      if (!isSafePath(appDir, fullPath) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      return res.download(fullPath, path.basename(fullPath));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async massDelete(req, res) {
    try {
      const { id } = req.params;
      const { files } = req.body;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'Array of files is required' });
      }

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      let count = 0;
      for (const item of files) {
        const fullPath = path.join(appDir, item);
        if (isSafePath(appDir, fullPath) && fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          count++;
        }
      }
      return res.json({ message: `Successfully deleted ${count} item(s)` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async duplicateFile(req, res) {
    try {
      const { id } = req.params;
      const filePath = req.body.filePath || req.body.path;
      if (!filePath) return res.status(400).json({ error: 'Parameter "filePath" or "path" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullOld = path.join(appDir, filePath);
      if (!fs.existsSync(fullOld) || !isSafePath(appDir, fullOld)) {
        return res.status(400).json({ error: 'Source file does not exist or invalid path' });
      }

      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const dir = path.dirname(filePath);
      const copyName = base + '.copy' + ext;
      const fullNew = path.join(appDir, dir, copyName);

      fs.cpSync(fullOld, fullNew, { recursive: true });
      return res.json({ success: true, message: 'File duplicated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async moveFile(req, res) {
    try {
      const { id } = req.params;
      const sourcePath = req.body.sourcePath || req.body.source || req.body.path;
      const destinationDir = req.body.destinationDir !== undefined ? req.body.destinationDir : (req.body.destination !== undefined ? req.body.destination : '');
      if (!sourcePath) return res.status(400).json({ error: '"sourcePath" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullOld = path.join(appDir, sourcePath);
      const fileName = path.basename(sourcePath);
      const fullNew = path.join(appDir, destinationDir, fileName);

      if (!fs.existsSync(fullOld) || !isSafePath(appDir, fullOld) || !isSafePath(appDir, fullNew)) {
        return res.status(400).json({ error: 'Invalid path or source does not exist' });
      }

      fs.renameSync(fullOld, fullNew);
      return res.json({ success: true, message: 'File moved successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async setPermissions(req, res) {
    try {
      const { id } = req.params;
      const { filePath, mode } = req.body;
      if (!filePath) return res.status(400).json({ error: '"filePath" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'files')) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const appDir = supervisor.getAppDir(id);
      const fullPath = path.join(appDir, filePath);
      if (!fs.existsSync(fullPath) || !isSafePath(appDir, fullPath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      try {
        const modeNum = typeof mode === 'string' ? parseInt(mode, 8) : mode;
        if (!isNaN(modeNum)) {
          fs.chmodSync(fullPath, modeNum);
        }
      } catch (e) {}

      return res.json({ success: true, message: 'Permissions updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

}
