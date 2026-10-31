import { db } from '../database/index.js';

/**
 * Checks whether a user has permission to access an application.
 * Admins and server owners have full permissions.
 * Sub-users / Collaborators have access according to their granted permission list.
 *
 * @param {string} appId
 * @param {object} user - { id, role }
 * @param {string|null} requiredPermission - e.g. 'console', 'files', 'power', 'database', 'backups'
 * @returns {boolean}
 */
export function checkAppAccess(appId, user, requiredPermission = null) {
  if (!user || !user.id) return false;
  if (user.role === 'admin') return true;

  const app = db.prepare('SELECT user_id FROM apps WHERE id = ?').get(appId);
  if (!app) return false;

  // Server owner has complete access
  if (app.user_id === user.id) return true;

  // Check if invited as collaborator / sub-user
  const collab = db.prepare('SELECT permissions FROM app_collaborators WHERE app_id = ? AND user_id = ?').get(appId, user.id);
  if (!collab) return false;

  // If no specific permission required (e.g. general read / view)
  if (!requiredPermission) return true;

  try {
    const perms = JSON.parse(collab.permissions || '[]');
    return perms.includes(requiredPermission) || perms.includes('*') || perms.includes('all');
  } catch (e) {
    return false;
  }
}
