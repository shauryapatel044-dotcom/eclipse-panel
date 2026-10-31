import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

const oldCollabIdx = html.indexOf('function loadCollaborators() {');
const oldCollabEnd = html.indexOf('async function deleteCollaborator', oldCollabIdx);
const oldCollab = html.slice(oldCollabIdx, oldCollabEnd);

const newCollabAndFeatures = `async function loadCollaborators() {
      if (!currentAppId) return;
      const listContainer = document.getElementById('collaborators-card-list');
      if (!listContainer) return;

      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/collaborators\`);
        const collabs = (res.data && res.data.collaborators) || [];

        if (collabs.length === 0) {
          listContainer.innerHTML = \`
            <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 48px 24px; text-align: center;">
              <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(6, 182, 212, 0.1); color: #06B6D4; display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 16px auto;">
                <i class="bi bi-people-fill"></i>
              </div>
              <div style="font-size: 16px; font-weight: 800; color: #FFF; margin-bottom: 6px;">It looks like you have no subusers.</div>
              <p style="font-size: 13px; color: #94A3B8; max-width: 440px; margin: 0 auto 20px auto; line-height: 1.5;">Invite operators to your server and assign granular permissions for terminal, file management, power controls, and databases.</p>
              <button type="button" class="btn-primary" onclick="openAddCollaboratorModal()" style="border-radius: 20px; padding: 9px 22px; font-size: 13px; font-weight: 700;">
                <i class="bi bi-person-plus-fill"></i> Invite Sub-User
              </button>
            </div>
          \`;
          return;
        }

        let cardsHtml = '';
        collabs.forEach(c => {
          let perms = [];
          try {
            perms = typeof c.permissions === 'string' ? JSON.parse(c.permissions) : (c.permissions || []);
          } catch(e) { perms = ['console', 'files']; }

          const initials = (c.username || 'U').slice(0, 2).toUpperCase();
          const permList = ['console', 'files', 'control', 'databases', 'backups'];

          const permBadgesHtml = permList.map(p => {
            const has = perms.includes(p) || perms.includes('*');
            return \`<span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; font-family: var(--font-mono); text-transform: uppercase; background: \${has ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)'}; color: \${has ? '#22D3EE' : '#64748B'}; border: 1px solid \${has ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.05)'};">\${p}</span>\`;
          }).join(' ');

          cardsHtml += \`
            <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; transition: border-color 0.2s;" onmouseover="this.style.borderColor='rgba(6,182,212,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #0891B2 0%, #06B6D4 100%); color: #041017; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center;">
                  \${initials}
                </div>
                <div>
                  <div style="font-size: 15px; font-weight: 800; color: #FFF;">\${escapeHtml(c.username)}</div>
                  <div style="font-size: 12px; color: #94A3B8; margin-top: 2px;">\${escapeHtml(c.email || 'Operator Account')}</div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                \${permBadgesHtml}
              </div>

              <div>
                <button type="button" class="btn-secondary" style="border-radius: 20px; padding: 7px 14px; font-size: 12px; color: #F87171; border-color: rgba(239,68,68,0.25);" onclick="deleteCollaborator('\${c.id}')" title="Revoke sub-user access">
                  <i class="bi bi-trash3-fill"></i> Remove
                </button>
              </div>
            </div>
          \`;
        });

        listContainer.innerHTML = cardsHtml;
      } catch (err) {
        console.error('loadCollaborators error:', err);
      }
    }

    async function submitAddCollaborator() {
      const username = document.getElementById('collab-username').value.trim();
      if (!username) return notify('Please enter a username', 'error');

      const perms = [];
      if (document.getElementById('perm-console')?.checked) perms.push('console');
      if (document.getElementById('perm-files')?.checked) perms.push('files');
      if (document.getElementById('perm-control')?.checked) perms.push('control');
      if (document.getElementById('perm-databases')?.checked) perms.push('databases');
      if (document.getElementById('perm-backups')?.checked) perms.push('backups');

      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/collaborators\`, {
          method: 'POST',
          body: JSON.stringify({ username, permissions: perms })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to add sub-user');
        notify('Sub-user invited successfully!', 'success');
        closeAddCollaboratorModal();
        loadCollaborators();
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Auto-Save Startup & Settings
    let autoSaveStartupTimer = null;
    let autoSaveSettingsTimer = null;

    function triggerAutoSaveStartup() {
      const badge = document.getElementById('startup-autosave-indicator');
      if (badge) {
        badge.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Saving...';
        badge.style.color = '#06B6D4';
      }
      clearTimeout(autoSaveStartupTimer);
      autoSaveStartupTimer = setTimeout(autoSaveStartupConfig, 400);
    }

    async function autoSaveStartupConfig() {
      if (!currentAppId) return;
      const rType = document.getElementById('startup-type-select').value;
      const rVer = document.getElementById('startup-version-select').value;
      const mainFile = document.getElementById('startup-var-main').value.trim() || (rType === 'nodejs' ? 'index.js' : 'main.py');
      const nodeArgs = document.getElementById('startup-var-nodeargs').value.trim();
      const nodePkg = document.getElementById('startup-var-nodepkg').value.trim();

      let cmd = '';
      if (rType === 'nodejs') {
        cmd = \`node \${mainFile} \${nodeArgs}\`.trim();
      } else if (rType === 'python') {
        cmd = \`python \${mainFile} \${nodeArgs}\`.trim();
      } else if (rType === 'java') {
        cmd = \`java -Xms512M -Xmx1024M -jar \${mainFile} nogui\`.trim();
      } else {
        cmd = \`./\${mainFile} \${nodeArgs}\`.trim();
      }

      const previewEl = document.getElementById('startup-preview-cmd');
      if (previewEl) previewEl.innerText = cmd;

      const payload = {
        type: rType,
        runtime_version: rVer,
        main_file: mainFile,
        entrypoint: mainFile,
        node_args: nodeArgs,
        node_packages: nodePkg,
        startup_cmd: cmd
      };

      const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/startup\`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      const badge = document.getElementById('startup-autosave-indicator');
      if (badge) {
        if (res.ok) {
          badge.innerHTML = '<i class="bi bi-check-circle-fill"></i> Auto-saved';
          badge.style.color = '#10B981';
        } else {
          badge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Retry';
          badge.style.color = '#F87171';
        }
      }
    }

    function triggerAutoSaveSettings() {
      const badge = document.getElementById('settings-autosave-indicator');
      if (badge) {
        badge.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Saving...';
        badge.style.color = '#06B6D4';
      }
      clearTimeout(autoSaveSettingsTimer);
      autoSaveSettingsTimer = setTimeout(autoSaveSettingsConfig, 400);
    }

    async function autoSaveSettingsConfig() {
      if (!currentAppId) return;
      const name = document.getElementById('set-name').value.trim();
      const desc = document.getElementById('set-desc').value.trim();
      const memLimit = parseInt(document.getElementById('set-mem-limit').value, 10) || 1024;
      const cpuLimit = parseInt(document.getElementById('set-cpu-limit').value, 10) || 100;
      const autoRestart = document.getElementById('set-auto-restart').checked ? 1 : 0;

      const payload = {
        name: name || undefined,
        description: desc,
        memory_limit: memLimit,
        cpu_limit: cpuLimit,
        auto_restart: autoRestart
      };

      const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}\`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      const badge = document.getElementById('settings-autosave-indicator');
      if (badge) {
        if (res.ok) {
          badge.innerHTML = '<i class="bi bi-check-circle-fill"></i> Auto-saved';
          badge.style.color = '#10B981';
          const heroName = document.getElementById('hero-app-name');
          if (heroName && name) heroName.innerText = name;
        } else {
          badge.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Retry';
          badge.style.color = '#F87171';
        }
      }
    }

    // Network Domain Methods
    function updateDnsInstructions(domain) {
      const clean = (domain || '').trim().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '');
      const hostEl = document.getElementById('dns-record-host');
      if (hostEl) hostEl.innerText = clean ? clean : '@';
    }

    async function saveDomainConfig() {
      if (!currentAppId) return;
      const domain = document.getElementById('net-domain-input').value.trim();
      if (!domain) return notify('Please enter a domain or subdomain', 'error');

      const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/domain\`, {
        method: 'POST',
        body: JSON.stringify({ domain })
      });
      if (!res.ok) return notify(res.data.error || 'Failed to attach domain', 'error');

      notify('Domain attached! Proceed with DNS verification.', 'success');
      const badge = document.getElementById('domain-status-badge');
      if (badge) {
        badge.innerText = 'Pending DNS';
        badge.className = 'feature-badge badge-cyan';
      }
    }

    async function verifyDomainDns() {
      if (!currentAppId) return;
      const domain = document.getElementById('net-domain-input').value.trim();
      if (!domain) return notify('Please enter a domain first', 'error');

      const msgEl = document.getElementById('dns-verify-msg');
      if (msgEl) {
        msgEl.innerHTML = '<span style="color: #06B6D4;"><i class="bi bi-arrow-repeat spin"></i> Querying DNS resolver...</span>';
      }

      const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/domain/verify\`, {
        method: 'POST',
        body: JSON.stringify({ domain })
      });

      if (res.ok && res.data.verified) {
        notify('DNS verified! Reverse proxy route active.', 'success');
        const badge = document.getElementById('domain-status-badge');
        if (badge) {
          badge.innerText = '🟢 Active & Routed';
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
          badge.style.color = '#10B981';
          badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        }
        if (msgEl) {
          msgEl.innerHTML = \`<span style="color: #10B981;"><i class="bi bi-check-circle-fill"></i> \${res.data.message}</span>\`;
        }
      } else {
        notify((res.data && res.data.message) || 'DNS verification failed', 'error');
        if (msgEl) {
          msgEl.innerHTML = \`<span style="color: #F87171;"><i class="bi bi-exclamation-circle-fill"></i> \${(res.data && res.data.message) || 'Could not resolve domain.'}</span>\`;
        }
      }
    }

    // Rich Editor Functions
    function setEditorFontSize(size) {
      const editor = document.getElementById('file-editor');
      const gutter = document.getElementById('editor-gutter');
      if (editor) editor.style.fontSize = size;
      if (gutter) gutter.style.fontSize = size;
      notify('Editor font size set to ' + size, 'info');
    }

    let isEditorWrapped = false;
    function toggleEditorWrap() {
      const editor = document.getElementById('file-editor');
      const btn = document.getElementById('btn-toggle-wrap');
      if (!editor || !btn) return;
      isEditorWrapped = !isEditorWrapped;
      editor.style.whiteSpace = isEditorWrapped ? 'pre-wrap' : 'pre';
      btn.innerHTML = isEditorWrapped ? '<i class="bi bi-text-wrap"></i> Wrap: ON' : '<i class="bi bi-text-wrap"></i> Wrap: OFF';
      btn.style.color = isEditorWrapped ? '#06B6D4' : '#94A3B8';
    }

    function setEditorLanguage(mode) {
      notify('Syntax mode: ' + mode.toUpperCase(), 'info');
    }

    function setEditorTheme(theme) {
      const root = document.getElementById('editor-workspace-root');
      const editor = document.getElementById('file-editor');
      const gutter = document.getElementById('editor-gutter');
      if (!root || !editor) return;

      if (theme === 'cyan') {
        root.style.background = '#060B12';
        root.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        gutter.style.background = '#08101A';
        gutter.style.color = '#06B6D4';
        editor.style.color = '#E0F2FE';
      } else if (theme === 'void') {
        root.style.background = '#000000';
        root.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        gutter.style.background = '#050505';
        gutter.style.color = '#38BDF8';
        editor.style.color = '#F8FAFC';
      } else {
        root.style.background = '#080912';
        root.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        gutter.style.background = '#0B0D18';
        gutter.style.color = '#4A5068';
        editor.style.color = '#F1F5F9';
      }
    }

    function findNextInEditor(term) {
      const editor = document.getElementById('file-editor');
      const countEl = document.getElementById('editor-find-count');
      if (!editor || !term) return;
      const val = editor.value;
      const idx = val.toLowerCase().indexOf(term.toLowerCase(), editor.selectionEnd || 0);
      const allMatches = val.toLowerCase().split(term.toLowerCase()).length - 1;

      if (countEl) countEl.innerText = allMatches > 0 ? \`\${allMatches} match(es)\` : '0';

      if (idx !== -1) {
        editor.focus();
        editor.setSelectionRange(idx, idx + term.length);
      } else {
        const firstIdx = val.toLowerCase().indexOf(term.toLowerCase(), 0);
        if (firstIdx !== -1) {
          editor.focus();
          editor.setSelectionRange(firstIdx, firstIdx + term.length);
        }
      }
    }

    function copyEntireEditorContent() {
      const editor = document.getElementById('file-editor');
      if (!editor) return;
      navigator.clipboard.writeText(editor.value).then(() => {
        notify('File content copied to clipboard!', 'success');
      });
    }

    `;

html = html.slice(0, oldCollabIdx) + newCollabAndFeatures + html.slice(oldCollabEnd);
fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Replaced loadCollaborators and injected all logic');
