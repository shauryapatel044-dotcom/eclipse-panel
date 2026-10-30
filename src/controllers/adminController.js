import bcrypt from 'bcryptjs';
import { db } from '../database/index.js';
import { getSystemStats } from '../daemon/metrics.js';
import { supervisor } from '../daemon/supervisor.js';

export class AdminController {
  static async getSystemInfo(req, res) {
    try {
      const stats = getSystemStats();

      const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const { count: totalUsers } = userCountStmt.get();

      const appCountStmt = db.prepare('SELECT COUNT(*) as count FROM apps');
      const { count: totalApps } = appCountStmt.get();

      // Count running processes
      let activeProcessesCount = 0;
      for (const [appId] of supervisor.managedProcesses) {
        if (supervisor.isRunning(appId)) {
          activeProcessesCount++;
        }
      }

      return res.json({
        system: stats,
        summary: {
          totalUsers,
          totalApps,
          runningApps: activeProcessesCount,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getUsers(req, res) {
    try {
      const stmt = db.prepare(`
        SELECT u.id, u.username, u.email, u.role, u.created_at,
               COUNT(a.id) as app_count
        FROM users u
        LEFT JOIN apps a ON u.id = a.user_id
        GROUP BY u.id
        ORDER BY u.created_at ASC
      `);
      const users = stmt.all();
      return res.json({ users });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, email, role, password } = req.body;
      const targetId = parseInt(id, 10);

      const targetStmt = db.prepare('SELECT * FROM users WHERE id = ?');
      const user = targetStmt.get(targetId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const newUsername = username ? username.trim().toLowerCase() : user.username;
      const newEmail = email ? email.trim().toLowerCase() : user.email;
      const newRole = role ? role.toLowerCase() : user.role;

      let newPasswordHash = user.password_hash;
      if (password && password.length >= 4) {
        newPasswordHash = await bcrypt.hash(password, 10);
      }

      const updateStmt = db.prepare(`
        UPDATE users
        SET username = ?, email = ?, role = ?, password_hash = ?
        WHERE id = ?
      `);
      updateStmt.run(newUsername, newEmail, newRole, newPasswordHash, targetId);

      return res.json({ message: 'User updated successfully' });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Username or email already in use' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateUserRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Role must be "admin" or "user"' });
      }

      if (req.user.id === parseInt(id, 10) && role !== 'admin') {
        return res.status(400).json({ error: 'Cannot demote your own account' });
      }

      const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
      stmt.run(role, id);

      return res.json({ message: `User role updated to ${role}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const targetId = parseInt(id, 10);

      if (req.user.id === targetId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const appsStmt = db.prepare('SELECT id FROM apps WHERE user_id = ?');
      const apps = appsStmt.all(targetId);

      for (const app of apps) {
        await supervisor.stopApp(app.id);
      }

      const delStmt = db.prepare('DELETE FROM users WHERE id = ?');
      delStmt.run(targetId);

      return res.json({ message: 'User and all associated apps deleted' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
