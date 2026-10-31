async function runTest() {
  // 1. Check Metrics IP
  const metricsRes = await fetch('http://localhost:8090/api/system/metrics');
  const metrics = await metricsRes.json();
  console.log('✓ Detected System IP:', metrics.ip, '(Real public/host IP)');

  // 2. Login as admin
  const loginRes = await fetch('http://localhost:8090/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  const token = (await loginRes.json()).token;

  // 3. Create test server
  const createRes = await fetch('http://localhost:8090/api/apps', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'RealIP-Test-Server',
      type: 'nodejs',
      runtime_version: '22',
      memory_limit: 1024,
      cpu_limit: 100,
      disk_limit: 5120
    })
  });
  const newApp = await createRes.json();
  const appId = newApp.appId;
  console.log('✓ Created App ID:', appId, 'Name:', newApp.name);

  // Check GET /api/apps/:id
  const getAppRes = await fetch(`http://localhost:8090/api/apps/${appId}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const appObj = await getAppRes.json();
  console.log('✓ App details from API -> Primary IP:', appObj.primary_ip, 'Port:', appObj.port);

  // 4. Create isolated database
  const dbCreateRes = await fetch(`http://localhost:8090/api/apps/${appId}/databases`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const dbData = await dbCreateRes.json();
  console.log('✓ Created DB:', dbData.database?.db_name, 'Host:', dbData.database?.host, 'Password:', dbData.database?.db_password);

  // 5. List databases to verify password is returned
  const listDbRes = await fetch(`http://localhost:8090/api/apps/${appId}/databases`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const listData = await listDbRes.json();
  console.log('✓ listDatabases count:', listData.databases?.length, 'Password in list:', listData.databases[0]?.db_password, 'Host in list:', listData.databases[0]?.host);

  // 6. Delete test server so panel stays clean
  const delRes = await fetch(`http://localhost:8090/api/apps/${appId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('✓ Purged test server:', (await delRes.json()).message);
}

runTest().catch(e => console.error('Test error:', e));
