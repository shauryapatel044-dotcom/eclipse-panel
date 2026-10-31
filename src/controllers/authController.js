import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database/index.js';
import { config } from '../config.js';

export class AuthController {
  static async register(req, res) {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }

      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }

      // Check if this is the first user registered in system
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const { count } = countStmt.get();
      const role = count === 0 ? 'admin' : 'user';

      const passwordHash = await bcrypt.hash(password, 10);

      const insertStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);

      const result = insertStmt.run(username.trim().toLowerCase(), email.trim().toLowerCase(), passwordHash, role);
      const userId = Number(result.lastInsertRowid);

      const token = jwt.sign({ id: userId, role }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
      });

      return res.status(201).json({
        message: 'Account created successfully',
        user: { id: userId, username, email, role },
        token,
      });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  static async login(req, res) {
    try {
      const login = req.body.login || req.body.username || req.body.email;
      const { password } = req.body;
      if (!login || !password) {
        return res.status(400).json({ error: 'Username/Email and password are required' });
      }

      const stmt = db.prepare(`
        SELECT id, username, email, password_hash, role
        FROM users
        WHERE username = ? OR email = ?
      `);
      const user = stmt.get(login.trim().toLowerCase(), login.trim().toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
      });

      return res.json({
        message: 'Login successful',
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
        token,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getMe(req, res) {
    return res.json({ user: req.user });
  }

  static async updateProfile(req, res) {
    try {
      const { username, email } = req.body;
      const userId = req.user.id;

      if (!username && !email) {
        return res.status(400).json({ error: 'Please provide a username or email to update' });
      }

      const currentStmt = db.prepare('SELECT username, email FROM users WHERE id = ?');
      const currentUser = currentStmt.get(userId);

      const newUsername = username ? username.trim().toLowerCase() : currentUser.username;
      const newEmail = email ? email.trim().toLowerCase() : currentUser.email;

      const updateStmt = db.prepare(`
        UPDATE users
        SET username = ?, email = ?
        WHERE id = ?
      `);
      updateStmt.run(newUsername, newEmail, userId);

      return res.json({
        message: 'Profile updated successfully',
        user: { id: userId, username: newUsername, email: newEmail, role: req.user.role },
      });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Username or email already taken by another account' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  static async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters' });
      }

      const stmt = db.prepare('SELECT password_hash FROM users WHERE id = ?');
      const user = stmt.get(userId);

      if (currentPassword) {
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
          return res.status(400).json({ error: 'Current password does not match' });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      const updateStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
      updateStmt.run(newHash, userId);

      return res.json({ message: 'Password updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // API Access Key Management
  static async listApiKeys(req, res) {
    try {
      const keys = db.prepare(`
        SELECT id, name, SUBSTR(key_token, 1, 12) || '...' as prefix, last_used, created_at
        FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(req.user.id);
      return res.json({ keys });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async createApiKey(req, res) {
    try {
      const { name } = req.body;
      const keyName = (name && name.trim()) || 'API Access Token';
      const keyId = `key_${crypto.randomBytes(4).toString('hex')}`;
      const rawToken = `ecl_live_${crypto.randomBytes(24).toString('hex')}`;

      db.prepare(`
        INSERT INTO api_keys (id, user_id, name, key_token)
        VALUES (?, ?, ?, ?)
      `).run(keyId, req.user.id, keyName, rawToken);

      return res.status(201).json({
        success: true,
        message: 'API Key generated successfully! Store it safely, it cannot be shown again.',
        key: rawToken,
        api_key: {
          id: keyId,
          name: keyName,
          prefix: `${rawToken.substring(0, 12)}...`,
          created_at: new Date().toISOString()
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async deleteApiKey(req, res) {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, req.user.id);
      return res.json({ success: true, message: 'API Key revoked successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
