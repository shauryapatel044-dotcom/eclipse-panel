import path from 'path';
import fs from 'fs';
import { db } from '../src/database/index.js';

const appsDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel\\storage\\apps';

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

db.prepare('DELETE FROM apps').run();

if (fs.existsSync(appsDir)) {
  const dirs = fs.readdirSync(appsDir);
  for (const d of dirs) {
    try {
      fs.rmSync(path.join(appsDir, d), { recursive: true, force: true });
    } catch (e) {}
  }
}

const remaining = db.prepare('SELECT count(*) as count FROM apps').get();
console.log('Remaining apps in DB:', remaining.count);
