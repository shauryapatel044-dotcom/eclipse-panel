import crypto from 'crypto';
import { db } from '../database/index.js';

export class CollaboratorController {
  // List team members for an app
  static async listCollaborators(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare(`
        SELECT c.id, c.app_id, c.user_id, c.permissions, c.created_at,
               u.username, u.email, u.role
        FROM app_collaborators c
        JOIN users u ON c.user_id = u.id
        WHERE c.app_id = ?
        ORDER BY c.created_at DESC
      `);
      const collaborators = stmt.all(id).map(c => ({
        ...c,
        permissions: JSON.parse(c.permissions || '[]')
      }));

      return res.json({ collaborators });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Invite sub-user to app
  static async addCollaborator(req, res) {
    try {
      const { id } = req.params;
      const { username_or_email, permissions } = req.body;

      if (!username_or_email) {
        return res.status(400).json({ error: 'Username or Gmail address is required' });
      }

      // Find user
      const targetUser = db.prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?')
        .get(username_or_email.trim().toLowerCase(), username_or_email.trim().toLowerCase());

      if (!targetUser) {
        return res.status(404).json({ error: `User "${username_or_email}" not found in system directory` });
      }

      // Check if already collaborator
      const existing = db.prepare('SELECT id FROM app_collaborators WHERE app_id = ? AND user_id = ?')
        .get(id, targetUser.id);
      if (existing) {
        return res.status(400).json({ error: `User is already a collaborator on this server` });
      }

      const permArray = Array.isArray(permissions) ? permissions : ['console', 'files', 'power'];
      const collabId = `collab_${crypto.randomBytes(4).toString('hex')}`;

      db.prepare(`
        INSERT INTO app_collaborators (id, app_id, user_id, permissions)
        VALUES (?, ?, ?, ?)
      `).run(collabId, id, targetUser.id, JSON.stringify(permArray));

      return res.status(201).json({
        message: `Operator @${targetUser.username} invited as collaborator!`,
        collaborator: { id: collabId, user_id: targetUser.id, username: targetUser.username, email: targetUser.email, permissions: permArray }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Remove collaborator
  static async removeCollaborator(req, res) {
    try {
      const { id, collabId } = req.params;
      db.prepare('DELETE FROM app_collaborators WHERE id = ? AND app_id = ?').run(collabId, id);
      return res.json({ message: 'Collaborator access revoked successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
