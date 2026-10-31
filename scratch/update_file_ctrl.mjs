import fs from 'fs';

let code = fs.readFileSync('src/controllers/fileController.js', 'utf8');
const lastBrace = code.lastIndexOf('}');
const newMethods = `
  static async duplicateFile(req, res) {
    try {
      const { id } = req.params;
      const { filePath } = req.body;
      if (!filePath) return res.status(400).json({ error: '"filePath" is required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
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
      const { sourcePath, destinationDir } = req.body;
      if (!sourcePath || destinationDir === undefined) return res.status(400).json({ error: '"sourcePath" and "destinationDir" are required' });

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
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

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
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
`;

code = code.slice(0, lastBrace) + newMethods + '\n}\n';
fs.writeFileSync('src/controllers/fileController.js', code, 'utf8');
console.log('Added duplicateFile, moveFile, and setPermissions to fileController.js');
