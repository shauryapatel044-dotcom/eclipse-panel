import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../database/index.js';

export function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1].trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization token. Pass Bearer token or X-API-Key header.' });
  }

  // 0. Check if token matches Cluster Secret (Node Daemon to Master Panel)
  if (config.clusterSecret && token === config.clusterSecret) {
    req.user = { id: 1, username: 'master_cluster', email: 'cluster@eclipse.internal', role: 'admin', is_cluster: true };
    return next();
  }

  // 1. Check if token is a permanent Eclipse API Key (ecl_...)
  if (token.startsWith('ecl_')) {
    try {
      const stmt = db.prepare(`
        SELECT k.id as key_id, u.id, u.username, u.email, u.role
        FROM api_keys k
        JOIN users u ON k.user_id = u.id
        WHERE k.key_token = ?
      `);
      const keyRow = stmt.get(token);

      if (keyRow) {
        try {
          db.prepare('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(keyRow.key_id);
        } catch (e) {}

        req.user = {
          id: keyRow.id,
          username: keyRow.username,
          email: keyRow.email,
          role: keyRow.role,
          is_api_key: true
        };
        return next();
      } else {
        return res.status(401).json({ error: 'Invalid or revoked API Key' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'API key verification error' });
    }
  }

  // 2. Validate JWT token
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Check if user exists in database
    const stmt = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?');
    const user = stmt.get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
    }
    next();
  });
}
