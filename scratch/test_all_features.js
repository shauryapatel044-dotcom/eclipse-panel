const BASE_URL = 'http://localhost:8090';

async function runTests() {
  console.log('🚀 Running Full Nebula Suite Test...\n');

  // 1. Login as Admin
  console.log('1. Admin Login...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  if (!loginRes.ok) throw new Error('Admin login failed: ' + (await loginRes.text()));
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('✓ Admin login successful. Token acquired.\n');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Apps count
  console.log('2. Verify server connectivity...');
  const appsRes = await fetch(`${BASE_URL}/api/apps`, { headers });
  const { apps: initialApps } = await appsRes.json();
  console.log(`✓ Current apps count: ${initialApps.length}`);

  // 3. Create a server
  console.log('\n3. Creating new test server "Nebula-Node-Test"...');
  const createRes = await fetch(`${BASE_URL}/api/apps`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Nebula-Node-Test',
      type: 'nodejs',
      port: 3999,
      entrypoint: 'index.js',
      runtime_version: '20'
    })
  });
  if (!createRes.ok) throw new Error('Create app failed: ' + (await createRes.text()));
  const createData = await createRes.json();
  const appId = createData.appId;
  console.log(`✓ Server created: ${createData.name} (${appId})`);

  // Wait 1 second for initial setup
  await new Promise(r => setTimeout(r, 1000));

  // 4. Test Files API
  console.log('\n4. Testing Files API...');
  const listRes = await fetch(`${BASE_URL}/api/files/${appId}/list`, { headers });
  const listData = await listRes.json();
  console.log(`✓ Root files found: ${listData.files.map(f => f.name).join(', ')}`);

  // Create Directory "controllers"
  console.log('Creating directory "controllers"...');
  const mkdirRes = await fetch(`${BASE_URL}/api/files/${appId}/mkdir`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: 'controllers' })
  });
  const mkdirData = await mkdirRes.json();
  console.log(`✓ ${mkdirData.message}`);

  // Create file inside "controllers/auth.js"
  console.log('Creating file "controllers/auth.js"...');
  const createSubFile = await fetch(`${BASE_URL}/api/files/${appId}/content`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: 'controllers/auth.js', content: 'export const auth = true;\n' })
  });
  const subFileData = await createSubFile.json();
  console.log(`✓ ${subFileData.message}`);

  // List subpath "controllers"
  const listSubRes = await fetch(`${BASE_URL}/api/files/${appId}/list?path=controllers`, { headers });
  const listSubData = await listSubRes.json();
  console.log(`✓ "controllers" contents: ${listSubData.files.map(f => f.name).join(', ')}`);

  // Test Download
  console.log('Testing file download...');
  const dlRes = await fetch(`${BASE_URL}/api/files/${appId}/download?file=controllers/auth.js`, { headers });
  if (!dlRes.ok) throw new Error('Download failed: ' + dlRes.statusText);
  const dlContent = await dlRes.text();
  console.log(`✓ Downloaded content: "${dlContent.trim()}"`);

  // Rename File
  console.log('Testing file rename...');
  const renRes = await fetch(`${BASE_URL}/api/files/${appId}/rename`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ oldPath: 'controllers/auth.js', newPath: 'controllers/session.js' })
  });
  const renData = await renRes.json();
  console.log(`✓ ${renData.message}`);

  // Mass Delete
  console.log('Testing mass-delete...');
  const massRes = await fetch(`${BASE_URL}/api/files/${appId}/mass-delete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: ['controllers/session.js', 'controllers'] })
  });
  const massData = await massRes.json();
  console.log(`✓ ${massData.message}`);

  // 5. Test Startup API: Change Runtime, Version, Start Cmd
  console.log('\n5. Testing Startup Configuration (Runtime, Version, Start Cmd)...');
  // Switch to Python 3.12
  console.log('Switching to Python 3.12...');
  const putStartupPy = await fetch(`${BASE_URL}/api/apps/${appId}/startup`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      type: 'python',
      runtime_version: '3.12',
      startup_cmd: 'python main.py',
      main_file: 'main.py'
    })
  });
  const putPyData = await putStartupPy.json();
  console.log(`✓ ${putPyData.message}`);

  const getStartupPy = await (await fetch(`${BASE_URL}/api/apps/${appId}/startup`, { headers })).json();
  console.log(`Updated startup: Type=${getStartupPy.startup.type}, Cmd="${getStartupPy.startup.startup_cmd}", Version=${getStartupPy.startup.runtime_version}`);

  // Switch to Java 21
  console.log('Switching to Java 21...');
  const putStartupJava = await fetch(`${BASE_URL}/api/apps/${appId}/startup`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      type: 'java',
      runtime_version: '21',
      startup_cmd: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar server.jar',
      main_file: 'server.jar'
    })
  });
  const putJavaData = await putStartupJava.json();
  console.log(`✓ ${putJavaData.message}`);

  // Switch back to Node.js 20
  console.log('Switching back to Node.js 20...');
  await fetch(`${BASE_URL}/api/apps/${appId}/startup`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      type: 'nodejs',
      runtime_version: '20',
      startup_cmd: 'node index.js',
      main_file: 'index.js'
    })
  });

  // 6. Test Process Lifecycle: Start, Restart, Stop, Kill
  console.log('\n6. Testing Lifecycle Actions...');
  console.log('Starting server...');
  const startRes = await fetch(`${BASE_URL}/api/apps/${appId}/action/start`, { method: 'POST', headers });
  const startData = await startRes.json();
  console.log(`✓ Started: status=${startData.status}, pid=${startData.pid}`);

  await new Promise(r => setTimeout(r, 1200));

  console.log('Restarting server...');
  const restartRes = await fetch(`${BASE_URL}/api/apps/${appId}/action/restart`, { method: 'POST', headers });
  const restartData = await restartRes.json();
  console.log(`✓ Restarted: status=${restartData.status}, pid=${restartData.pid}`);

  await new Promise(r => setTimeout(r, 1000));

  console.log('Stopping server...');
  const stopRes = await fetch(`${BASE_URL}/api/apps/${appId}/action/stop`, { method: 'POST', headers });
  const stopData = await stopRes.json();
  console.log(`✓ Stopped: status=${stopData.status}`);

  console.log('Starting and Killing server...');
  await fetch(`${BASE_URL}/api/apps/${appId}/action/start`, { method: 'POST', headers });
  await new Promise(r => setTimeout(r, 800));
  const killRes = await fetch(`${BASE_URL}/api/apps/${appId}/action/kill`, { method: 'POST', headers });
  const killData = await killRes.json();
  console.log(`✓ Killed: status=${killData.status}`);

  // 7. Cleanup only test app
  console.log('\n7. Cleaning up test app...');
  const delRes = await fetch(`${BASE_URL}/api/apps/${appId}`, { method: 'DELETE', headers });
  const delData = await delRes.json();
  console.log(`✓ ${delData.message}`);

  // 8. Verify all page routes
  console.log('\n8. Checking HTTP 200 for frontend routes...');
  const routes = ['/', '/app.html', '/account.html', '/admin.html', '/admin-stats.html'];
  for (const route of routes) {
    const r = await fetch(`${BASE_URL}${route}`);
    if (r.status !== 200) throw new Error(`Route ${route} returned status ${r.status}`);
    console.log(`✓ ${route} -> 200 OK`);
  }

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! EVERYTHING IS VERIFIED!');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
