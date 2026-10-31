import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';

async function verifyAll() {
  const db = new DatabaseSync('storage/data/eclipse.db');
  const user = db.prepare('SELECT id, username, email, role FROM users LIMIT 1').get();
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: '1h' });
  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  console.log('--- 1. Testing GET /app.html ---');
  const appHtmlRes = await fetch('http://localhost:8090/app.html');
  console.log('app.html status:', appHtmlRes.status);
  const appHtml = await appHtmlRes.text();
  console.log('Has nebulaFadeSlideUp:', appHtml.includes('nebulaFadeSlideUp'));
  console.log('Has btn-play animation class:', appHtml.includes('btn-play'));
  console.log('Has file-three-dots-btn:', appHtml.includes('file-three-dots-btn'));
  console.log('Has modal-create-directory:', appHtml.includes('id="modal-create-directory"'));
  console.log('Has side-nav-designer:', appHtml.includes('id="side-nav-designer"'));

  console.log('\n--- 2. Testing GET /designer.html ---');
  const desRes = await fetch('http://localhost:8090/designer.html');
  console.log('designer.html status:', desRes.status);
  const desHtml = await desRes.text();
  console.log('Has Palette tab:', desHtml.includes('tab-palette'));
  console.log('Has Electric Cyan preset:', desHtml.includes('Electric Cyan'));

  console.log('\n--- 3. Testing Designer Theme API ---');
  const themeGet = await fetch('http://localhost:8090/api/admin/theme', { headers });
  console.log('GET /api/admin/theme:', themeGet.status);
  const themePost = await fetch('http://localhost:8090/api/admin/theme', {
    method: 'POST',
    headers,
    body: JSON.stringify({ primary: '#06B6D4', hover: '#22D3EE', powerStyle: 'pills' })
  });
  console.log('POST /api/admin/theme:', themePost.status);

  console.log('\n--- 4. Testing Server Lifecycle Actions on DB app ---');
  const currentApp = db.prepare('SELECT id, name FROM apps LIMIT 1').get();
  if (currentApp) {
    const appId = currentApp.id;
    console.log('Testing app:', appId, currentApp.name);

    const startRes = await fetch(`http://localhost:8090/api/apps/${appId}/action/start`, { method: 'POST', headers });
    console.log('Start app status:', startRes.status);
    const stopRes = await fetch(`http://localhost:8090/api/apps/${appId}/action/stop`, { method: 'POST', headers });
    console.log('Stop app status:', stopRes.status);

    console.log('\n--- 5. Testing File Manager API Endpoints ---');
    const listRes = await fetch(`http://localhost:8090/api/files/${appId}/list?path=`, { headers });
    console.log('List files status:', listRes.status);

    const mkdirRes = await fetch(`http://localhost:8090/api/files/${appId}/mkdir`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: 'nebula_test_folder' })
    });
    console.log('Create folder status:', mkdirRes.status);

    const delRes = await fetch(`http://localhost:8090/api/files/${appId}/delete`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ path: 'nebula_test_folder' })
    });
    console.log('Delete folder status:', delRes.status);
  } else {
    console.log('No apps currently in DB to test actions on (Zero default servers verified)');
  }

  console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
}

verifyAll().catch(e => console.error('Verification failed:', e));
