import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const STITCH_DIR = path.join(ROOT_DIR, 'stitch_extracted', 'stitch_crimsonpanel_application_dashboard');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

console.log('Wiring Stitch UI screens with Port 8090, Framer Motion UI/UX & VPS Telemetry Page...');

const COMMON_SCRIPT = `
<!-- Framer Motion CDN & Real-Time Client Core -->
<script src="https://cdn.jsdelivr.net/npm/framer-motion@11.11.11/dist/framer-motion.js"></script>
<script>
  const API_BASE = window.location.origin + '/api';
  const WS_BASE = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws';
  let token = localStorage.getItem('crimson_token') || '';

  function getHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function logout() {
    localStorage.removeItem('crimson_token');
    window.location.href = '/login.html';
  }

  function requireAuth() {
    if (!token && !window.location.pathname.endsWith('login.html')) {
      window.location.href = '/login.html';
    }
  }

  // Update navigation hrefs across pages
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[data-path="overview"]').forEach(el => el.href = '/');
    document.querySelectorAll('a[data-path="applications"]').forEach(el => el.href = '/app.html');
    document.querySelectorAll('a[data-path="live-terminal"]').forEach(el => el.href = '/app.html');
    document.querySelectorAll('a[data-path="file-manager"]').forEach(el => el.href = '/app.html');
    document.querySelectorAll('a[data-path="admin-center"]').forEach(el => el.href = '/admin.html');
    document.querySelectorAll('a[data-path="vps-stats"]').forEach(el => el.href = '/admin-stats.html');
    document.querySelectorAll('button[title="Sign out"]').forEach(el => el.onclick = logout);

    // Add Telemetry link to nav if missing
    const nav = document.querySelector('nav');
    if (nav && !nav.querySelector('a[href="/admin-stats.html"]')) {
      const statsLink = document.createElement('a');
      statsLink.href = '/admin-stats.html';
      statsLink.className = 'group flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all font-body-md text-body-md';
      statsLink.innerHTML = '<div class="flex items-center gap-space-sm"><span class="material-symbols-outlined text-xl text-on-surface-variant group-hover:text-primary transition-colors">speed</span><span>VPS Telemetry</span></div><span class="font-label-sm text-label-sm px-1 py-0.2 bg-tertiary/20 text-tertiary rounded font-mono">LIVE</span>';
      nav.appendChild(statsLink);
    }
  });
</script>
`;

// 1. Process Authentication Page (login.html)
let authHtml = fs.readFileSync(path.join(STITCH_DIR, 'authentication_onboarding', 'code.html'), 'utf8');

authHtml = authHtml.replace('function handleAuthSubmit() {', `
  async function handleAuthSubmit() {
    const isRegister = !document.getElementById('register-fields').classList.contains('hidden');
    const operatorId = document.getElementById('operator-id').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password')?.value;

    if (isRegister && password !== confirmPassword) {
      alert('Master keys do not match.');
      return;
    }

    const btn = document.getElementById('submit-cta');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">sync</span> <span>Connecting to Port 8090...</span>';

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegister 
        ? { username: operatorId.split('@')[0], email: operatorId.includes('@') ? operatorId : operatorId + '@panel.local', password }
        : { login: operatorId, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication rejected');

      localStorage.setItem('crimson_token', data.token);
      localStorage.setItem('crimson_user', JSON.stringify(data.user));

      btn.innerHTML = '<span class="material-symbols-outlined text-base text-tertiary">check_circle</span> <span>Authorized!</span>';
      setTimeout(() => { window.location.href = '/'; }, 500);
    } catch (err) {
      alert(err.message);
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  }
  function __mock_disabled() {
`);

fs.writeFileSync(path.join(PUBLIC_DIR, 'login.html'), authHtml, 'utf8');
console.log('✓ Wired public/login.html');

// 2. Process Overview Dashboard (index.html)
let overviewHtml = fs.readFileSync(path.join(STITCH_DIR, 'overview_dashboard', 'code.html'), 'utf8');

const OVERVIEW_INTEGRATION = `
${COMMON_SCRIPT}
<script>
  requireAuth();

  // Load real telemetry from WebSocket or REST
  async function fetchSystemStats() {
    try {
      const res = await fetch(API_BASE + '/admin/system', { headers: getHeaders() });
      if (res.ok) {
        const d = await res.json();
        const load = d.system.cpu.overallPercent !== undefined ? d.system.cpu.overallPercent : (d.system.loadAvg[0] || 0);
        const cpuEl = document.getElementById('cpu-metric-val');
        if (cpuEl) cpuEl.innerText = load;

        // Update RAM
        if (d.system.memory) {
          const ramVal = d.system.memory.usedMB;
          const ramTotal = d.system.memory.totalMB;
          const ramEl = document.querySelector('[class*="headline-xl"]:has(+ [class*="label-md"])');
          if (ramEl) ramEl.innerText = ramVal.toLocaleString();
        }
      }
    } catch (e) {}
  }

  // Load dynamic applications list
  async function loadApplications() {
    try {
      const res = await fetch(API_BASE + '/apps', { headers: getHeaders() });
      if (!res.ok) {
        if (res.status === 401) logout();
        return;
      }
      const data = await res.json();
      console.log('Applications loaded:', data.apps);
    } catch (e) {}
  }

  // Real-time WebSocket connection
  function connectWs() {
    const ws = new WebSocket(WS_BASE);
    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'system:stats' }));
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'system_stats' && msg.data) {
          const cpuVal = msg.data.cpu.overallPercent;
          const cpuEl = document.getElementById('cpu-metric-val');
          if (cpuEl && cpuVal !== undefined) cpuEl.innerText = cpuVal;
        }
      } catch (e) {}
    };
    ws.onclose = () => setTimeout(connectWs, 3000);
  }

  // Hook New App button
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.innerText.includes('New App')) {
        btn.onclick = async () => {
          const name = prompt('Enter application name (e.g. node-api, py-fastapi):');
          if (!name) return;
          const type = confirm('Press OK for Python 3 (venv), or Cancel for Node.js 22') ? 'python' : 'nodejs';
          const port = prompt('Enter port number (e.g. 3000, 8000, or leave blank):');
          try {
            const res = await fetch(API_BASE + '/apps', {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ name, type, port: port ? parseInt(port, 10) : undefined })
            });
            const d = await res.json();
            if (res.ok) {
              alert('Application created successfully: ' + d.name);
              window.location.href = '/app.html?id=' + d.appId;
            } else {
              alert(d.error);
            }
          } catch (e) {
            alert(e.message);
          }
        };
      }
    });
    fetchSystemStats();
    loadApplications();
    connectWs();
  });
</script>
`;

overviewHtml = overviewHtml.replace('</body>', OVERVIEW_INTEGRATION + '</body>');
fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), overviewHtml, 'utf8');
console.log('✓ Wired public/index.html');

// 3. Process Application Control Center (app.html)
let appHtml = fs.readFileSync(path.join(STITCH_DIR, 'application_control_center', 'code.html'), 'utf8');

const APP_INTEGRATION = `
${COMMON_SCRIPT}
<script>
  requireAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const currentAppId = urlParams.get('id');

  let activeWs = null;

  async function loadAppDetails() {
    if (!currentAppId) {
      const listRes = await fetch(API_BASE + '/apps', { headers: getHeaders() });
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.apps && listData.apps.length > 0) {
          window.location.search = '?id=' + listData.apps[0].id;
          return;
        }
      }
      return;
    }

    try {
      const res = await fetch(API_BASE + '/apps/' + currentAppId, { headers: getHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const app = data.app;

      const titleEl = document.querySelector('h1');
      if (titleEl) titleEl.innerText = app.name;

      connectAppWebSocket(app.id);
    } catch (e) {
      console.error(e);
    }
  }

  function connectAppWebSocket(appId) {
    activeWs = new WebSocket(WS_BASE);
    activeWs.onopen = () => {
      if (token) activeWs.send(JSON.stringify({ type: 'auth', token }));
      activeWs.send(JSON.stringify({ type: 'subscribe', channel: 'logs:' + appId }));
    };
    activeWs.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'log') {
          appendLogLine(msg.stream, msg.message);
        }
      } catch (e) {}
    };
  }

  function appendLogLine(stream, message) {
    const term = document.querySelector('pre') || document.querySelector('[class*="terminal"]');
    if (term) {
      const line = document.createElement('div');
      line.className = stream === 'stderr' ? 'text-primary' : (stream === 'system' ? 'text-tertiary' : 'text-on-surface');
      line.innerText = message;
      term.appendChild(line);
      term.scrollTop = term.scrollHeight;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button').forEach(btn => {
      const txt = btn.innerText.toLowerCase();
      if (txt.includes('start')) {
        btn.onclick = () => triggerAction('start');
      } else if (txt.includes('stop')) {
        btn.onclick = () => triggerAction('stop');
      } else if (txt.includes('restart')) {
        btn.onclick = () => triggerAction('restart');
      } else if (txt.includes('install')) {
        btn.onclick = () => triggerAction('install');
      }
    });

    loadAppDetails();
  });

  async function triggerAction(action) {
    if (!currentAppId) return;
    try {
      const res = await fetch(API_BASE + '/apps/' + currentAppId + '/action/' + action, {
        method: 'POST',
        headers: getHeaders()
      });
      const d = await res.json();
      alert(d.message || action + ' initiated');
    } catch (e) {
      alert(e.message);
    }
  }
</script>
`;

appHtml = appHtml.replace('</body>', APP_INTEGRATION + '</body>');
fs.writeFileSync(path.join(PUBLIC_DIR, 'app.html'), appHtml, 'utf8');
console.log('✓ Wired public/app.html');

// 4. Process Admin Center (admin.html)
let adminHtml = fs.readFileSync(path.join(STITCH_DIR, 'admin_center', 'code.html'), 'utf8');

const ADMIN_INTEGRATION = `
${COMMON_SCRIPT}
<script>
  requireAuth();

  async function loadAdminData() {
    try {
      const userRes = await fetch(API_BASE + '/admin/users', { headers: getHeaders() });
      if (!userRes.ok) {
        alert('Access denied: Administrator privileges required.');
        window.location.href = '/';
        return;
      }
      const sysRes = await fetch(API_BASE + '/admin/system', { headers: getHeaders() });
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        console.log('Host Diagnostics:', sysData);
      }
    } catch (e) {
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', loadAdminData);
</script>
`;

adminHtml = adminHtml.replace('</body>', ADMIN_INTEGRATION + '</body>');
fs.writeFileSync(path.join(PUBLIC_DIR, 'admin.html'), adminHtml, 'utf8');
console.log('✓ Wired public/admin.html');

console.log('Integration complete with port 8090 and VPS Telemetry!');
