import { DatabaseSync } from 'node:sqlite';

async function testEndpoints() {
  const db = new DatabaseSync('storage/data/eclipse.db');
  const user = db.prepare('SELECT id, username, role FROM users LIMIT 1').get();
  console.log('User in DB:', user);

  // login to get token
  const loginRes = await fetch('http://localhost:8090/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'password123' })
  });
  console.log('Login status:', loginRes.status);
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Token received:', !!token);

  const headers = { 'Authorization': `Bearer ${token}` };
  const appId = 'app_800077f1';

  const endpoints = [
    { name: 'App details', url: `/api/apps/${appId}` },
    { name: 'File list', url: `/api/files/${appId}/list?path=` },
    { name: 'Databases', url: `/api/apps/${appId}/databases` },
    { name: 'Backups', url: `/api/apps/${appId}/backups` },
    { name: 'Schedules', url: `/api/apps/${appId}/schedules` },
    { name: 'Collaborators', url: `/api/apps/${appId}/collaborators` },
    { name: 'Activity', url: `/api/apps/${appId}/activity` },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`http://localhost:8090${ep.url}`, { headers });
      console.log(`${ep.name} (${ep.url}) -> status: ${res.status}`);
      if (!res.ok) {
        const text = await res.text();
        console.log('   Error body:', text);
      }
    } catch (e) {
      console.log(`${ep.name} failed to fetch:`, e.message);
    }
  }
}

testEndpoints();
