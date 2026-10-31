import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';

const db = new DatabaseSync('storage/data/eclipse.db');
const user = db.prepare('SELECT id, username, email, role FROM users LIMIT 1').get();
const app = db.prepare('SELECT * FROM apps LIMIT 1').get();
console.log('App in DB:', app ? app.id : 'NONE');

const token = jwt.sign({ id: user.id, username: user.username, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: '1h' });

const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
const appId = app.id;

const eps = [
  '/api/apps/' + appId,
  '/api/files/' + appId + '/list?path=',
  '/api/apps/' + appId + '/databases',
  '/api/apps/' + appId + '/backups',
  '/api/apps/' + appId + '/schedules',
  '/api/apps/' + appId + '/collaborators',
  '/api/apps/' + appId + '/activity',
];

for (const ep of eps) {
  const res = await fetch('http://localhost:8090' + ep, { headers });
  console.log(ep, '->', res.status);
  if (!res.ok) {
    console.log('   Response:', await res.text());
  }
}
