import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export const db = new DatabaseSync(config.dbPath);

// Initialize Tables and Pragma
export function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'nodejs' or 'python'
      user_id INTEGER NOT NULL,
      entrypoint TEXT NOT NULL,
      port INTEGER,
      env_vars TEXT DEFAULT '{}',
      auto_restart INTEGER DEFAULT 1,
      status TEXT DEFAULT 'stopped',
      memory_limit INTEGER DEFAULT 1024,
      cpu_limit INTEGER DEFAULT 100,
      disk_limit INTEGER DEFAULT 5120,
      primary_ip TEXT DEFAULT '0.0.0.0',
      domain TEXT DEFAULT '',
      runtime_version TEXT DEFAULT '',
      startup_cmd TEXT DEFAULT '',
      main_file TEXT DEFAULT '',
      node_packages TEXT DEFAULT '',
      unnode_packages TEXT DEFAULT '',
      node_args TEXT DEFAULT '',
      requirements_file TEXT DEFAULT 'requirements.txt',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS panel_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate columns if needed
  try { db.exec(`ALTER TABLE apps ADD COLUMN memory_limit INTEGER DEFAULT 1024;`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN cpu_limit INTEGER DEFAULT 100;`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN disk_limit INTEGER DEFAULT 5120;`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN primary_ip TEXT DEFAULT '0.0.0.0';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN domain TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN runtime_version TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN startup_cmd TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN main_file TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN node_packages TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN unnode_packages TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN node_args TEXT DEFAULT '';`); } catch (e) {}
  try { db.exec(`ALTER TABLE apps ADD COLUMN requirements_file TEXT DEFAULT 'requirements.txt';`); } catch (e) {}

  // Seed default admin account if not existing (admin / admin)
  try {
    const checkAdmin = db.prepare('SELECT id FROM users WHERE username = ?');
    const existing = checkAdmin.get('admin');

    if (!existing) {
      const defaultHash = bcrypt.hashSync('admin', 10);
      const seedStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `);
      seedStmt.run('admin', 'admin@eclipsepanel.local', defaultHash, 'admin');
      console.log('[Database] 🛡️ Default SuperAdmin seeded: Username: "admin" | Password: "admin"');
    }
  } catch (err) {
    console.error('[Database] Admin seed notice:', err.message);
  }

  console.log(`[Database] SQLite connected & schema initialized at: ${config.dbPath}`);
}
