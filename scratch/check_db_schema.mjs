import { db } from '../src/database/index.js';

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

try {
  const schema = db.prepare("PRAGMA table_info(app_databases)").all();
  console.log('app_databases schema:', schema);
} catch (e) {
  console.log('app_databases error:', e.message);
}
