import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// Replace loadSchedules
const oldLoadSchedules = `    async function loadSchedules() {
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
    }`;

const newLoadSchedules = `    async function loadSchedules() {
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
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">\${s.last_run || s.last_run_at ? new Date(s.last_run || s.last_run_at).toLocaleString() : 'Never'}</td>
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
    }`;

if (html.includes(oldLoadSchedules)) {
  html = html.replace(oldLoadSchedules, newLoadSchedules);
  console.log('✓ Replaced loadSchedules');
} else {
  console.warn('! oldLoadSchedules not found');
}

// Replace submitCreateSchedule
const oldSubmitCreateSchedule = `    async function submitCreateSchedule() {
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
    }`;

const newSubmitCreateSchedule = `    async function submitCreateSchedule() {
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
    }`;

if (html.includes(oldSubmitCreateSchedule)) {
  html = html.replace(oldSubmitCreateSchedule, newSubmitCreateSchedule);
  console.log('✓ Replaced submitCreateSchedule');
} else {
  console.warn('! oldSubmitCreateSchedule not found');
}

// Replace runScheduleNow & deleteSchedule
const oldRunDeleteSchedule = `    async function runScheduleNow(scheduleId) {
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

const newRunDeleteSchedule = `    async function runScheduleNow(scheduleId) {
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

if (html.includes(oldRunDeleteSchedule)) {
  html = html.replace(oldRunDeleteSchedule, newRunDeleteSchedule);
  console.log('✓ Replaced run & delete schedule');
} else {
  console.warn('! oldRunDeleteSchedule not found');
}

// Replace deleteCollaborator
const oldDeleteCollab = `    async function deleteCollaborator(collabId) {
      if (!confirm('Revoke access for this sub-user?')) return;
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/collaborators/\${collabId}\`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          notify('Access revoked', 'success');
          loadCollaborators();
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

const newDeleteCollab = `    async function deleteCollaborator(collabId) {
      if (!confirm('Revoke access for this sub-user?')) return;
      try {
        const res = await safeApi(\`\${API_BASE}/apps/\${currentAppId}/collaborators/\${collabId}\`, {
          method: 'DELETE'
        });
        if (res.ok) {
          notify('Sub-user access revoked successfully', 'success');
          loadCollaborators();
        } else {
          notify(res.data.error || 'Failed to revoke sub-user access', 'error');
        }
      } catch (err) {
        notify(err.message, 'error');
      }
    }`;

if (html.includes(oldDeleteCollab)) {
  html = html.replace(oldDeleteCollab, newDeleteCollab);
  console.log('✓ Replaced deleteCollaborator');
} else {
  console.warn('! oldDeleteCollab not found');
}

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('✓ Finished updating schedules and collab in app.html');
