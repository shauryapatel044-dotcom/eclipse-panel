import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// Replace openProfileModal and closeModal
const targetProfileAndClose = `    function openProfileModal() {
      if (currentUser) {
        document.getElementById('self-user').value = currentUser.username || '';
        document.getElementById('self-email').value = currentUser.email || '';
      }
      document.getElementById('modal-profile').classList.add('open');
    }
    function closeProfileModal() { document.getElementById('modal-profile').classList.remove('open'); }

    let currentActiveTab = 'console';

    function closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
    }`;

const replaceProfileAndClose = `    function openModal(id) {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'flex';
        el.classList.add('open');
      }
    }

    function closeModal(id) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('open');
        el.style.display = 'none';
      }
    }

    function openProfileModal() {
      if (currentUser) {
        const u = currentUser;
        const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        setV('self-user', u.username);
        setV('self-email', u.email);
      }
      openModal('modal-profile');
    }
    function closeProfileModal() { closeModal('modal-profile'); }

    let currentActiveTab = 'console';`;

if (html.includes(targetProfileAndClose)) {
  html = html.replace(targetProfileAndClose, replaceProfileAndClose);
  console.log('✓ Successfully replaced openModal & closeModal definitions');
} else {
  console.warn('! targetProfileAndClose not found');
}

// Replace loadDatabases and deleteDatabase
const targetDbSection = `    // DATABASES (MARIADB)
    async function loadDatabases() {
      if (!currentAppId) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/databases\`, { headers: getHeaders() });
        if (!res.ok) return;
        const dbs = await res.json();
        const grid = document.getElementById('databases-grid');
        if (!dbs || dbs.length === 0) {
          grid.innerHTML = '<div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); padding: 20px;">No databases provisioned for this server yet. Click "+ Create Dedicated Database" above.</div>';
          return;
        }

        grid.innerHTML = dbs.map(db => {
          const uri = \`mysql://\${db.db_user}:\${db.db_password}@\${db.db_host}:\${db.db_port}/\${db.db_name}\`;
          return \`
            <div class="feature-card">
              <div class="feature-card-header">
                <div class="feature-card-title">
                  <span style="color: var(--neon-cyan);">🗄️</span> \${escapeHtml(db.db_name)}
                </div>
                <span class="feature-badge badge-online">MARIADB :\${db.db_port}</span>
              </div>
              <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px;">
                <div><strong>Host:</strong> \${escapeHtml(db.db_host)}</div>
                <div><strong>User:</strong> \${escapeHtml(db.db_user)}</div>
                <div><strong>Password:</strong> <span style="letter-spacing: 2px;">••••••••••••</span></div>
              </div>
              <div style="background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px; font-family: var(--font-mono); font-size: 11px; word-break: break-all; color: #86EFAC; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span>\${escapeHtml(uri)}</span>
                <button class="quick-cmd-btn" onclick="copyAddressToClipboard('\${escapeHtml(uri)}')">📋</button>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                <button class="quick-cmd-btn" style="color: var(--primary);" onclick="deleteDatabase('\${db.id}')">Delete DB</button>
              </div>
            </div>
          \`;
        }).join('');
      } catch (err) {
        console.error('Error loading databases:', err);
      }
    }

    async function createDatabase() {
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
    }

    async function deleteDatabase(dbId) {
      if (!confirm('Permanently delete this database and drop all tables?')) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/databases/\${dbId}\`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          notify('Database deleted', 'success');
          loadDatabases();
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

const replaceDbSection = `    // DATABASES (MARIADB)
    async function loadDatabases() {
      if (!currentAppId) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/databases\`);
        const grid = document.getElementById('databases-grid');
        if (!grid) return;
        const dbs = (res.data && (res.data.databases || res.data)) || [];
        if (!Array.isArray(dbs) || dbs.length === 0) {
          grid.innerHTML = '<div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); padding: 20px;">No databases provisioned for this server yet. Click "+ Create Dedicated Database" above.</div>';
          return;
        }

        grid.innerHTML = dbs.map(db => {
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
        }).join('');
      } catch (err) {
        console.error('Error loading databases:', err);
      }
    }

    async function createDatabase() {
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
    }

    async function deleteDatabase(dbId) {
      if (!confirm('Permanently delete this database and drop all tables?')) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/databases/\${dbId}\`, {
          method: 'DELETE'
        });
        if (res.ok) {
          notify('Database deleted successfully', 'success');
          loadDatabases();
        } else {
          notify(res.data.error || 'Failed to delete database', 'error');
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

if (html.includes(targetDbSection)) {
  html = html.replace(targetDbSection, replaceDbSection);
  console.log('✓ Successfully replaced database section');
} else {
  console.warn('! targetDbSection not found');
}

// Replace Backups Section
const targetBackupSection = `    // BACKUPS & SNAPSHOTS
    async function loadBackups() {
      if (!currentAppId) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/backups\`, { headers: getHeaders() });
        if (!res.ok) return;
        const backups = await res.json();
        const tbody = document.getElementById('backups-tbody');
        if (!backups || backups.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 24px; color: var(--text-muted); font-family: var(--font-mono);">No backup archives created yet.</td></tr>';
          return;
        }

        tbody.innerHTML = backups.map(b => {
          const sizeMb = (b.size_bytes / (1024 * 1024)).toFixed(2) + ' MB';
          return \`
            <tr>
              <td>
                <div style="font-weight: 700; color: #FFF; font-family: var(--font-mono);">\${escapeHtml(b.filename)}</div>
              </td>
              <td style="font-family: var(--font-mono); font-size: 12px; color: #86EFAC;">\${sizeMb}</td>
              <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">\${new Date(b.created_at).toLocaleString()}</td>
              <td>
                <div style="display: flex; gap: 6px;">
                  <a href="\${API_BASE}/apps/\${currentAppId}/backups/\${b.id}/download?token=\${token}" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">Download</a>
                  <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="restoreBackup('\${b.id}')">Restore</button>
                  <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--primary);" onclick="deleteBackup('\${b.id}')">Delete</button>
                </div>
              </td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        console.error('Error loading backups:', err);
      }
    }

    async function createBackup() {
      if (!currentAppId) return;
      const btn = document.getElementById('btn-create-backup');
      btn.disabled = true;
      btn.innerText = 'Creating .tar.gz Snapshot...';
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/backups\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Backup creation failed');
        notify('Backup archive created successfully!', 'success');
        loadBackups();
      } catch (err) {
        notify(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerText = '+ Create Snapshot Archive';
      }
    }

    async function restoreBackup(backupId) {
      if (!confirm('WARNING: Restoring this backup will replace current files in your server workspace. Proceed?')) return;
      try {
        notify('Restoring archive files...', 'info');
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/backups/\${backupId}/restore\`, {
          method: 'POST',
          headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Restore failed');
        notify('Backup restored successfully!', 'success');
        loadFiles(currentAppId);
      } catch (err) {
        notify(err.message, 'error');
      }
    }

    async function deleteBackup(backupId) {
      if (!confirm('Permanently delete this backup archive?')) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/backups/\${backupId}\`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          notify('Backup deleted', 'success');
          loadBackups();
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

const replaceBackupSection = `    // BACKUPS & SNAPSHOTS
    async function loadBackups() {
      if (!currentAppId) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/backups\`);
        const tbody = document.getElementById('backups-tbody');
        if (!tbody) return;
        const backups = (res.data && (res.data.backups || res.data)) || [];
        if (!Array.isArray(backups) || backups.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 24px; color: var(--text-muted); font-family: var(--font-mono);">No backup archives created yet.</td></tr>';
          return;
        }

        tbody.innerHTML = backups.map(b => {
          const sizeMb = b.size_bytes ? (b.size_bytes / (1024 * 1024)).toFixed(2) + ' MB' : (b.size_formatted || '0 MB');
          return \`
            <tr>
              <td>
                <div style="font-weight: 700; color: #FFF; font-family: var(--font-mono);">\${escapeHtml(b.filename)}</div>
              </td>
              <td style="font-family: var(--font-mono); font-size: 12px; color: #22D3EE;">\${sizeMb}</td>
              <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">\${b.created_at ? new Date(b.created_at).toLocaleString() : 'Recently'}</td>
              <td>
                <div style="display: flex; gap: 6px;">
                  <a href="\${API_BASE}/apps/\${currentAppId}/backups/\${b.id}/download?token=\${token}" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; text-decoration: none;" download>Download</a>
                  <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #F59E0B; border-color: rgba(245,158,11,0.25);" onclick="restoreBackup('\${b.id}')">Restore</button>
                  <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #F87171; border-color: rgba(239,68,68,0.25);" onclick="deleteBackup('\${b.id}')">Delete</button>
                </div>
              </td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        console.error('Error loading backups:', err);
      }
    }

    async function createBackup() {
      if (!currentAppId) return;
      const btn = document.getElementById('btn-create-backup');
      if (btn) { btn.disabled = true; btn.innerText = 'Creating Snapshot...'; }
      try {
        notify('Generating server snapshot archive (.tar.gz)...', 'info');
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/backups\`, {
          method: 'POST',
          body: JSON.stringify({ notes: 'Manual Snapshot' })
        });
        if (!res.ok) throw new Error(res.data.error || 'Backup creation failed');
        notify('Backup archive created successfully!', 'success');
        loadBackups();
      } catch (err) {
        notify(err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = '+ Create Snapshot Archive'; }
      }
    }

    async function restoreBackup(backupId) {
      if (!confirm('WARNING: Restoring this backup will replace current files in your server workspace. Proceed?')) return;
      try {
        notify('Restoring archive files...', 'info');
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/backups/\${backupId}/restore\`, {
          method: 'POST'
        });
        if (!res.ok) throw new Error(res.data.error || 'Restore failed');
        notify('Backup restored successfully!', 'success');
        loadFiles(currentAppId);
      } catch (err) {
        notify(err.message, 'error');
      }
    }

    async function deleteBackup(backupId) {
      if (!confirm('Permanently delete this backup archive?')) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/backups/\${backupId}\`, {
          method: 'DELETE'
        });
        if (res.ok) {
          notify('Backup deleted successfully', 'success');
          loadBackups();
        } else {
          notify(res.data.error || 'Failed to delete backup', 'error');
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

if (html.includes(targetBackupSection)) {
  html = html.replace(targetBackupSection, replaceBackupSection);
  console.log('✓ Successfully replaced backup section');
} else {
  console.warn('! targetBackupSection not found');
}

// Replace Schedules Section
const targetSchedulesSection = `    // SCHEDULES (CRON)
    async function loadSchedules() {
      if (!currentAppId) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/schedules\`, { headers: getHeaders() });
        if (!res.ok) return;
        const scheds = await res.json();
        const tbody = document.getElementById('schedules-tbody');
        if (!scheds || scheds.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted); font-family: var(--font-mono);">No cron schedules configured.</td></tr>';
          return;
        }

        tbody.innerHTML = scheds.map(s => \`
          <tr>
            <td style="font-weight: 700; color: #FFF;">\${escapeHtml(s.name)}</td>
            <td><span class="feature-badge badge-violet">\${escapeHtml(s.action)}</span></td>
            <td style="font-family: var(--font-mono); font-size: 12px; color: #86EFAC;">\${escapeHtml(s.cron_expr)}</td>
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">\${s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never'}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="runScheduleNow('\${s.id}')">Run Now</button>
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--primary);" onclick="deleteSchedule('\${s.id}')">Delete</button>
              </div>
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Error loading schedules:', err);
      }
    }

    async function submitCreateSchedule() {
      const name = document.getElementById('sched-name').value.trim();
      const action = document.getElementById('sched-action').value;
      const cron_expr = document.getElementById('sched-cron').value.trim();
      const command = document.getElementById('sched-cmd').value.trim();

      if (!name || !cron_expr) {
        return notify('Please fill all required schedule fields', 'error');
      }

      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/schedules\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ name, action, cron_expr, command })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to create schedule');

        closeCreateScheduleModal();
        notify('Cron schedule saved & activated!', 'success');
        loadSchedules();
      } catch (err) {
        notify(err.message, 'error');
      }
    }

    async function runScheduleNow(scheduleId) {
      if (!currentAppId) return;
      try {
        notify('Triggering scheduled action...', 'info');
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/schedules/\${scheduleId}/run\`, {
          method: 'POST',
          headers: getHeaders()
        });
        if (res.ok) notify('Schedule executed successfully!', 'success');
        loadSchedules();
      } catch (err) {
        notify(err.message, 'error');
      }
    }

    async function deleteSchedule(scheduleId) {
      if (!confirm('Delete this cron schedule?')) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/schedules/\${scheduleId}\`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          notify('Schedule deleted', 'success');
          loadSchedules();
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

const replaceSchedulesSection = `    // SCHEDULES (CRON)
    async function loadSchedules() {
      if (!currentAppId) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/schedules\`);
        const tbody = document.getElementById('schedules-tbody');
        if (!tbody) return;
        const scheds = (res.data && (res.data.schedules || res.data)) || [];
        if (!Array.isArray(scheds) || scheds.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted); font-family: var(--font-mono);">No cron schedules configured.</td></tr>';
          return;
        }

        tbody.innerHTML = scheds.map(s => \`
          <tr>
            <td style="font-weight: 700; color: #FFF;">\${escapeHtml(s.name)}</td>
            <td><span class="feature-badge badge-violet">\${escapeHtml(s.action)}</span></td>
            <td style="font-family: var(--font-mono); font-size: 12px; color: #86EFAC;">\${escapeHtml(s.cron_expr)}</td>
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">\${s.last_run ? new Date(s.last_run).toLocaleString() : 'Never'}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="runScheduleNow('\${s.id}')">Run Now</button>
                <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #F87171;" onclick="deleteSchedule('\${s.id}')">Delete</button>
              </div>
            </td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Error loading schedules:', err);
      }
    }

    async function submitCreateSchedule() {
      const name = document.getElementById('sched-name').value.trim();
      const action = document.getElementById('sched-action').value;
      const cron_expr = document.getElementById('sched-cron').value.trim();
      const command = document.getElementById('sched-cmd').value.trim();

      if (!name || !cron_expr) {
        return notify('Please fill all required schedule fields', 'error');
      }

      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/schedules\`, {
          method: 'POST',
          body: JSON.stringify({ name, action, cron_expr, command })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to create schedule');

        closeModal('modal-create-schedule');
        notify('Cron schedule saved & activated!', 'success');
        loadSchedules();
      } catch (err) {
        notify(err.message, 'error');
      }
    }

    async function runScheduleNow(scheduleId) {
      if (!currentAppId) return;
      try {
        notify('Triggering scheduled action...', 'info');
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/schedules/\${scheduleId}/run\`, {
          method: 'POST'
        });
        if (res.ok) notify('Schedule executed successfully!', 'success');
        else notify(res.data.error || 'Execution failed', 'error');
        loadSchedules();
      } catch (err) {
        notify(err.message, 'error');
      }
    }

    async function deleteSchedule(scheduleId) {
      if (!confirm('Delete this cron schedule?')) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/schedules/\${scheduleId}\`, {
          method: 'DELETE'
        });
        if (res.ok) {
          notify('Schedule deleted successfully', 'success');
          loadSchedules();
        } else {
          notify(res.data.error || 'Failed to delete schedule', 'error');
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

if (html.includes(targetSchedulesSection)) {
  html = html.replace(targetSchedulesSection, replaceSchedulesSection);
  console.log('✓ Successfully replaced schedules section');
} else {
  console.warn('! targetSchedulesSection not found');
}

// Replace deleteCollaborator
const targetDeleteCollab = `    async function deleteCollaborator(collabId) {
      if (!confirm('Revoke access for this sub-user?')) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/collaborators/\${collabId}\`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to delete');
        notify('Sub-user removed', 'success');
        loadCollaborators();
      } catch (e) {
        notify(e.message, 'error');
      }
    }`;

const replaceDeleteCollab = `    async function deleteCollaborator(collabId) {
      if (!confirm('Revoke access for this sub-user?')) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/collaborators/\${collabId}\`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to remove sub-user');
        notify('Sub-user access revoked successfully', 'success');
        loadCollaborators();
      } catch (e) {
        notify(e.message, 'error');
      }
    }`;

if (html.includes(targetDeleteCollab)) {
  html = html.replace(targetDeleteCollab, replaceDeleteCollab);
  console.log('✓ Successfully replaced deleteCollaborator');
} else {
  console.warn('! targetDeleteCollab not found');
}

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('✓ Finished applying server tabs safeApi patches!');
