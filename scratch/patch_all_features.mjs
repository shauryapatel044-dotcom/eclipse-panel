import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. Add safeApi helper function at the top of script
const scriptStart = 'const API_BASE = window.location.origin + \'/api\';';
const safeApiFunc = `const API_BASE = window.location.origin + '/api';

    async function safeApi(url, options = {}) {
      try {
        const res = await fetch(url, {
          ...options,
          headers: { ...getHeaders(), ...(options.headers || {}) }
        });
        const text = await res.text();
        let data = {};
        if (text && text.trim().length > 0) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { error: text.slice(0, 120) };
          }
        }
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, status: 0, data: { error: 'Network connection or server restart error' } };
      }
    }`;

if (!html.includes('async function safeApi')) {
  html = html.replace(scriptStart, safeApiFunc);
  console.log('Added safeApi');
}

// 2. Fix execAction to use safeApi so "Unexpected end of JSON input" NEVER happens
const oldExecAction = `async function execAction(action) {
      if (!currentAppId) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/action/\${action}\`, {
          method: 'POST',
          headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) notify(d.error || 'Action failed', 'error');
        switchApp(currentAppId);
      } catch (e) { notify(e.message, 'error'); }
    }`;

const newExecAction = `async function execAction(action) {
      if (!currentAppId) return;
      try {
        const result = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/action/\${action}\`, {
          method: 'POST'
        });
        if (!result.ok) {
          notify(result.data.error || 'Action failed', 'error');
        } else {
          notify(result.data.message || \`Action \${action} dispatched successfully\`, 'success');
        }
        setTimeout(() => switchApp(currentAppId), 600);
      } catch (e) {
        notify('Failed to execute ' + action, 'error');
      }
    }`;

html = html.replace(oldExecAction, newExecAction);
console.log('Updated execAction with safeApi');

// 3. Fix createDatabase to use safeApi
const oldCreateDb = `async function createDatabase() {
      if (!currentAppId) return;
      try {
        notify('Provisioning isolated MariaDB database & user...', 'info');
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/databases\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to create database');
        notify('Database provisioned successfully! Environment injected.', 'success');
        loadDatabases();
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

const newCreateDb = `async function createDatabase() {
      if (!currentAppId) return;
      try {
        notify('Provisioning isolated MariaDB database & user...', 'info');
        const result = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/databases\`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        if (!result.ok) {
          throw new Error(result.data.error || 'Failed to provision MariaDB database');
        }
        notify('Database provisioned successfully! Credentials generated.', 'success');
        loadDatabases();
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

html = html.replace(oldCreateDb, newCreateDb);
console.log('Updated createDatabase with safeApi');

// 4. Ensure .modal-backdrop is styled in <style>
const modalBackdropCss = `
    .modal-backdrop {
      display: none !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.78) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      z-index: 99999 !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      padding: 20px !important;
    }
    .modal-backdrop.open {
      display: flex !important;
    }
`;

if (!html.includes('.modal-backdrop.open')) {
  html = html.replace('</style>', modalBackdropCss + '\n  </style>');
  console.log('Added modal-backdrop style');
}

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch step 1 applied');
