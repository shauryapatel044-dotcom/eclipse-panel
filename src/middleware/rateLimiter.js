import { db } from '../database/index.js';

const failedAttempts = new Map(); // IP -> { count, lockedUntil }

export function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const record = failedAttempts.get(ip);
  if (record && record.lockedUntil && record.lockedUntil > now) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `Too many failed login attempts. IP temporarily banned for ${minutesLeft} minute(s) by Eclipse Shield.`
    });
  }

  // Hook into response to count failures
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 401 || res.statusCode === 400) {
      const rec = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
      rec.count += 1;
      if (rec.count >= 5) {
        rec.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
        try {
          db.prepare('INSERT INTO audit_logs (action, details, ip_address) VALUES (?, ?, ?)')
            .run('BRUTE_FORCE_LOCK', `IP locked after 5 failed attempts`, ip);
        } catch (e) {}
      }
      failedAttempts.set(ip, rec);
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      failedAttempts.delete(ip);
      try {
        const username = body.user ? body.user.username : 'operator';
        db.prepare('INSERT INTO audit_logs (username, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(username, 'LOGIN_SUCCESS', 'Operator authenticated into matrix', ip);
      } catch (e) {}
    }
    return originalJson(body);
  };

  next();
}
