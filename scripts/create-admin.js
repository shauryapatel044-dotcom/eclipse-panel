import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../src/database/index.js';

initDatabase();

const args = process.argv.slice(2);
let username = 'admin';
let email = 'admin@eclipse.local';
let password = 'admin';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--username' && args[i + 1]) username = args[++i];
  if (args[i] === '--email' && args[i + 1]) email = args[++i];
  if (args[i] === '--password' && args[i + 1]) password = args[++i];
}

const passwordHash = bcrypt.hashSync(password, 10);

try {
  const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  const existing = checkStmt.get(username);

  if (existing) {
    db.prepare(`
      UPDATE users 
      SET email = ?, password_hash = ?, role = 'admin' 
      WHERE username = ?
    `).run(email, passwordHash, username);
    console.log(`[Admin Setup] Updated existing administrator "${username}" with new credentials.`);
  } else {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role) 
      VALUES (?, ?, ?, 'admin')
    `).run(username, email, passwordHash);
    console.log(`[Admin Setup] Created new administrator "${username}" successfully.`);
  }
} catch (err) {
  console.error('[Admin Setup Error]', err.message);
  process.exit(1);
}
