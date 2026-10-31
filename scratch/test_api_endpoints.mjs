async function test() {
  const loginRes = await fetch('http://localhost:8090/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  const loginData = await loginRes.json();
  console.log('✓ Admin login status:', loginRes.status, 'Token exists:', !!loginData.token);
  const token = loginData.token;

  const appRes = await fetch('http://localhost:8090/api/apps', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await appRes.json();
  const apps = Array.isArray(data) ? data : (data.apps || []);
  console.log('✓ Apps count:', apps.length);

  if (apps.length > 0) {
    const appId = apps[0].id;
    // Test Stop
    const stopRes = await fetch(`http://localhost:8090/api/apps/${appId}/action/stop`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('✓ Stop app status:', stopRes.status, await stopRes.json());

    // Test Start
    const startRes = await fetch(`http://localhost:8090/api/apps/${appId}/action/start`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('✓ Start app status:', startRes.status, await startRes.json());

    // Test Database creation
    const dbRes = await fetch(`http://localhost:8090/api/apps/${appId}/databases`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    console.log('✓ DB create status:', dbRes.status, await dbRes.json());

    // Test Domain Save
    const domRes = await fetch(`http://localhost:8090/api/apps/${appId}/domain`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'api.example.com' })
    });
    console.log('✓ Domain save status:', domRes.status, await domRes.json());
  }
}

test().catch(e => console.error('Test error:', e));
