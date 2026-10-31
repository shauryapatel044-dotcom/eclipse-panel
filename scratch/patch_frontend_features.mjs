import fs from 'fs';

// --- 1. PATCH public/app.html ---
let appHtml = fs.readFileSync('public/app.html', 'utf8');

// Add getEffectiveHostIp and initHostMetrics right after safeApi
const safeApiEnd = `    async function safeApi(url, options = {}) {
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

const effectiveIpAddon = `    window.detectedHostIp = '';
    function getEffectiveHostIp(app) {
      if (app && app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') {
        return app.primary_ip;
      }
      if (window.detectedHostIp && window.detectedHostIp !== '127.0.0.1' && window.detectedHostIp !== '0.0.0.0') {
        return window.detectedHostIp;
      }
      if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.hostname;
      }
      return window.detectedHostIp || '127.0.0.1';
    }

    async function initHostMetrics() {
      try {
        const res = await safeApi(API_BASE + '/system/metrics');
        if (res.ok && res.data && res.data.ip) {
          window.detectedHostIp = res.data.ip;
          if (currentAppObj) switchApp(currentAppId);
        }
      } catch (e) {}
    }
    initHostMetrics();`;

if (appHtml.includes(safeApiEnd)) {
  appHtml = appHtml.replace(safeApiEnd, safeApiEnd + '\n\n' + effectiveIpAddon);
  console.log('✓ Injected getEffectiveHostIp and initHostMetrics into app.html');
}

// Update switchApp IP resolution in app.html
appHtml = appHtml.replace(
  `        const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0') ? app.primary_ip : (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname);
        const fullAddress = \`\${hostIp}:\${app.port || '3000'}\`;`,
  `        const hostIp = getEffectiveHostIp(app);
        const fullAddress = \`\${hostIp}:\${app.port || '3000'}\`;
        const heroIpEl = document.getElementById('hero-ip-tag');
        if (heroIpEl) heroIpEl.innerText = 'IP: ' + fullAddress;`
);

// Update updateLiveTelemetry IP resolution in app.html
appHtml = appHtml.replace(
  `        const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0') ? app.primary_ip : (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname);
        fullAddress = \`\${hostIp}:\${app.port || '3000'}\`;`,
  `        const hostIp = getEffectiveHostIp(app);
        fullAddress = \`\${hostIp}:\${app.port || '3000'}\`;`
);

// Update network tab IP elements in switchApp
appHtml = appHtml.replace(
  `if (netIp) netIp.innerText = (app.primary_ip && app.primary_ip !== '0.0.0.0') ? app.primary_ip : '127.0.0.1';`,
  `if (netIp) netIp.innerText = getEffectiveHostIp(app);`
);

// Update populateSettingsTab SFTP address
appHtml = appHtml.replace(
  `sftpInput.value = \`sftp://\${window.location.hostname || '127.0.0.1'}:2022\`;`,
  `sftpInput.value = \`sftp://\${getEffectiveHostIp(app)}:2022\`;`
);

// Update Database tab: add toggleDbPassword and interactive card with reveal & copy buttons
const oldDbRenderBlock = `        grid.innerHTML = dbs.map(db => {
          const dbHost = db.host || db.db_host || '127.0.0.1';
          const dbPort = db.port || db.db_port || 3306;
          const uri = \`mysql://\${db.db_user}:\${db.db_password}@\${dbHost}:\${dbPort}/\${db.db_name}\`;
          return \`
            <div class="feature-card">
              <div class="feature-card-header">
                <div class="feature-card-title">
                  <span style="color: var(--neon-cyan);">🗄️</span> \${escapeHtml(db.db_name)}
                </div>
                <span class="feature-badge badge-online">MARIADB :\${dbPort}</span>
              </div>
              <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px;">
                <div><strong>Host:</strong> \${escapeHtml(dbHost)}</div>
                <div><strong>User:</strong> \${escapeHtml(db.db_user)}</div>
                <div><strong>Password:</strong> <span style="letter-spacing: 2px;">••••••••••••</span></div>
              </div>
              <div style="background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px; font-family: var(--font-mono); font-size: 11px; word-break: break-all; color: #86EFAC; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span>\${escapeHtml(uri)}</span>
                <button class="quick-cmd-btn" onclick="copyAddressToClipboard('\${escapeHtml(uri)}')">📋</button>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                <button class="quick-cmd-btn" style="color: #F87171; border-color: rgba(239,68,68,0.25);" onclick="deleteDatabase('\${db.id}')">Delete DB</button>
              </div>
            </div>
          \`;
        }).join('');`;

const newDbRenderBlock = `        grid.innerHTML = dbs.map(db => {
          const dbHost = db.host || getEffectiveHostIp(currentAppObj);
          const dbPort = db.port || db.db_port || 3306;
          const plainPass = db.db_password || '';
          const uri = \`mysql://\${db.db_user}:\${plainPass}@\${dbHost}:\${dbPort}/\${db.db_name}\`;
          return \`
            <div class="feature-card" style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 18px 20px;">
              <div class="feature-card-header" style="margin-bottom: 14px;">
                <div class="feature-card-title" style="font-size: 15px; font-weight: 800; color: #FFF; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #06B6D4;"><i class="bi bi-database-fill"></i></span> \${escapeHtml(db.db_name)}
                </div>
                <span class="feature-badge badge-online" style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; font-family: var(--font-mono);">MARIADB :\${dbPort}</span>
              </div>
              <div style="font-family: var(--font-mono); font-size: 12px; color: #94A3B8; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span><strong>Host:</strong> <span style="color: #22D3EE;">\${escapeHtml(dbHost)}</span></span>
                  <span><strong>Port:</strong> <span style="color: #FFF;">\${dbPort}</span></span>
                </div>
                <div><strong>User:</strong> <span style="color: #FFF; font-weight: 700;">\${escapeHtml(db.db_user)}</span></div>
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
                  <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                    <strong style="color: #64748B;">Password:</strong>
                    <span id="db-pass-val-\${db.id}" style="letter-spacing: 2px; font-family: var(--font-mono); color: #FFF; font-weight: 700; user-select: text;">••••••••••••</span>
                  </div>
                  <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <button type="button" class="btn-secondary" style="padding: 4px 9px; font-size: 11px; border-radius: 8px;" onclick="toggleDbPassword('\${db.id}', '\${escapeHtml(plainPass)}')" title="Show / Hide Password">
                      <i class="bi bi-eye-fill" id="db-pass-icon-\${db.id}"></i>
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 4px 9px; font-size: 11px; border-radius: 8px;" onclick="copyAddressToClipboard('\${escapeHtml(plainPass)}')" title="Copy Password">
                      <i class="bi bi-copy"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div style="margin-top: 14px; background: rgba(0,0,0,0.5); padding: 10px 14px; border-radius: 10px; font-family: var(--font-mono); font-size: 11px; word-break: break-all; color: #86EFAC; display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid rgba(134,239,172,0.15);">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${escapeHtml(uri)}</span>
                <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 11px; flex-shrink: 0;" onclick="copyAddressToClipboard('\${escapeHtml(uri)}')">Copy URI</button>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
                <button type="button" class="btn-secondary" style="color: #F87171; border-color: rgba(239,68,68,0.25); font-size: 12px; padding: 6px 14px; border-radius: 20px;" onclick="deleteDatabase('\${db.id}')">
                  <i class="bi bi-trash3-fill"></i> Delete DB
                </button>
              </div>
            </div>
          \`;
        }).join('');`;

if (appHtml.includes(oldDbRenderBlock)) {
  appHtml = appHtml.replace(oldDbRenderBlock, newDbRenderBlock);
  console.log('✓ Successfully replaced database cards with password reveal/copy UI in app.html');
}

// Add toggleDbPassword function in app.html if missing
const toggleDbPassFunc = `
    function toggleDbPassword(id, plainPass) {
      const span = document.getElementById('db-pass-val-' + id);
      const icon = document.getElementById('db-pass-icon-' + id);
      if (!span) return;
      if (span.getAttribute('data-shown') === '1') {
        span.innerText = '••••••••••••';
        span.style.letterSpacing = '2px';
        span.setAttribute('data-shown', '0');
        if (icon) icon.className = 'bi bi-eye-fill';
      } else {
        span.innerText = plainPass;
        span.style.letterSpacing = 'normal';
        span.setAttribute('data-shown', '1');
        if (icon) icon.className = 'bi bi-eye-slash-fill';
      }
    }
`;

if (!appHtml.includes('function toggleDbPassword')) {
  appHtml = appHtml.replace('function copyAddressToClipboard', toggleDbPassFunc + '\n    function copyAddressToClipboard');
  console.log('✓ Injected toggleDbPassword function into app.html');
}

fs.writeFileSync('public/app.html', appHtml, 'utf8');


// --- 2. PATCH public/index.html ---
let indexHtml = fs.readFileSync('public/index.html', 'utf8');

// Store data.ip in fetchLiveMetrics
indexHtml = indexHtml.replace(
  `        if (res.ok) {
          const data = await res.json();
          updateMetricsUI(data);
        }`,
  `        if (res.ok) {
          const data = await res.json();
          if (data && data.ip) window.detectedHostIp = data.ip;
          updateMetricsUI(data);
        }`
);

// In renderAppsTable: calculate hostIp without falling back to 127.0.0.1
indexHtml = indexHtml.replace(
  `const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0')
              ? app.primary_ip
              : (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname);`,
  `const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1')
              ? app.primary_ip
              : (window.detectedHostIp || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : window.detectedHostIp || '127.0.0.1'));`
);

// In card render template
indexHtml = indexHtml.replace(
  `const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0')
            ? app.primary_ip
            : (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname);`,
  `const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1')
            ? app.primary_ip
            : (window.detectedHostIp || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : window.detectedHostIp || '127.0.0.1'));`
);

fs.writeFileSync('public/index.html', indexHtml, 'utf8');
console.log('✓ Updated index.html with real host IP resolution');


// --- 3. PATCH public/admin.html ---
let adminHtml = fs.readFileSync('public/admin.html', 'utf8');

adminHtml = adminHtml.replace(
  `const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0') ? app.primary_ip : (window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname);`,
  `const hostIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : (window.detectedHostIp || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.hostname : window.detectedHostIp || '127.0.0.1'));`
);

fs.writeFileSync('public/admin.html', adminHtml, 'utf8');
console.log('✓ Updated admin.html with real host IP resolution');
