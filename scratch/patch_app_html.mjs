import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. Update modal divs to include class "modal-backdrop modal-overlay" and style="display: none;"
html = html.replace(
  '<div class="modal-overlay" id="modal-profile">',
  '<div class="modal-overlay modal-backdrop" id="modal-profile" style="display: none;">'
);

html = html.replace(
  '<div class="modal-overlay" id="modal-create-schedule">',
  '<div class="modal-overlay modal-backdrop" id="modal-create-schedule" style="display: none;">'
);

html = html.replace(
  '<div class="modal-overlay" id="modal-add-collab">',
  '<div class="modal-overlay modal-backdrop" id="modal-add-collab" style="display: none;">'
);

html = html.replace(
  '<div id="modal-create-directory" class="modal-backdrop">',
  '<div id="modal-create-directory" class="modal-backdrop modal-overlay" style="display: none;">'
);

html = html.replace(
  '<div id="modal-move-file" class="modal-backdrop">',
  '<div id="modal-move-file" class="modal-backdrop modal-overlay" style="display: none;">'
);

html = html.replace(
  '<div id="modal-rename-file" class="modal-backdrop">',
  '<div id="modal-rename-file" class="modal-backdrop modal-overlay" style="display: none;">'
);

html = html.replace(
  '<div id="modal-permissions" class="modal-backdrop">',
  '<div id="modal-permissions" class="modal-backdrop modal-overlay" style="display: none;">'
);

// 2. Update openModal & closeModal functions
const oldModalFuncs = `    function openProfileModal() {
      if (currentUser) {
        const u = currentUser;
        const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        setV('self-username', u.username);
        setV('self-email', u.email);
      }
      document.getElementById('modal-profile').classList.add('open');
    }
    function closeProfileModal() { document.getElementById('modal-profile').classList.remove('open'); }

    let currentActiveTab = 'console';

    function closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
    }`;

const newModalFuncs = `    function openModal(id) {
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
        setV('self-username', u.username);
        setV('self-email', u.email);
      }
      openModal('modal-profile');
    }
    function closeProfileModal() { closeModal('modal-profile'); }

    let currentActiveTab = 'console';`;

if (html.includes(oldModalFuncs)) {
  html = html.replace(oldModalFuncs, newModalFuncs);
  console.log('✓ Replaced oldModalFuncs');
} else {
  console.warn('! oldModalFuncs target not found directly, checking partial');
}

// 3. Rename "Nebula Dark" theme to "Eclipse Dark"
html = html.replace('<option value="dark">Nebula Dark</option>', '<option value="dark">Eclipse Dark</option>');

// 4. Update power buttons to add classes matching CSS animations
html = html.replace(
  '<button type="button" class="nebula-circle-btn start" id="btn-start" onclick="execAction(\'start\')" title="Start Server">',
  '<button type="button" class="nebula-circle-btn start btn-play" id="btn-start" onclick="execAction(\'start\')" title="Start Server">'
);
html = html.replace(
  '<button type="button" class="nebula-circle-btn restart" id="btn-restart" onclick="execAction(\'restart\')" title="Restart Server">',
  '<button type="button" class="nebula-circle-btn restart btn-restart" id="btn-restart" onclick="execAction(\'restart\')" title="Restart Server">'
);
html = html.replace(
  '<button type="button" class="nebula-circle-btn stop" id="btn-stop" onclick="execAction(\'stop\')" title="Stop Server">',
  '<button type="button" class="nebula-circle-btn stop btn-stop" id="btn-stop" onclick="execAction(\'stop\')" title="Stop Server">'
);

// 5. Update openAddCollaboratorModal / closeAddCollaboratorModal
html = html.replace(
  `function openAddCollaboratorModal() { document.getElementById('modal-add-collab').classList.add('open'); }`,
  `function openAddCollaboratorModal() { openModal('modal-add-collab'); }`
);
html = html.replace(
  `function closeAddCollaboratorModal() { document.getElementById('modal-add-collab').classList.remove('open'); }`,
  `function closeAddCollaboratorModal() { closeModal('modal-add-collab'); }`
);

// 6. Update openCreateScheduleModal / closeCreateScheduleModal
html = html.replace(
  `function openCreateScheduleModal() { document.getElementById('modal-create-schedule').classList.add('open'); }`,
  `function openCreateScheduleModal() { openModal('modal-create-schedule'); }`
);
html = html.replace(
  `function closeCreateScheduleModal() { document.getElementById('modal-create-schedule').classList.remove('open'); }`,
  `function closeCreateScheduleModal() { closeModal('modal-create-schedule'); }`
);

// 7. Update file modals opening
html = html.replace(
  `const modal = document.getElementById('modal-create-directory');\n      if (modal) {\n        modal.classList.add('open');`,
  `const modal = document.getElementById('modal-create-directory');\n      if (modal) {\n        openModal('modal-create-directory');`
);

html = html.replace(
  `const modal = document.getElementById('modal-move-file');\n      if (modal) {\n        modal.classList.add('open');`,
  `const modal = document.getElementById('modal-move-file');\n      if (modal) {\n        openModal('modal-move-file');`
);

html = html.replace(
  `const modal = document.getElementById('modal-rename-file');\n      if (modal) {\n        modal.classList.add('open');`,
  `const modal = document.getElementById('modal-rename-file');\n      if (modal) {\n        openModal('modal-rename-file');`
);

html = html.replace(
  `const modal = document.getElementById('modal-permissions');\n      if (modal) modal.classList.add('open');`,
  `const modal = document.getElementById('modal-permissions');\n      if (modal) openModal('modal-permissions');`
);

// 8. Fix submitAddCollaborator checkbox check
html = html.replace(
  `if (document.getElementById('perm-control')?.checked) perms.push('control');`,
  `if (document.getElementById('perm-control')?.checked || document.getElementById('perm-power')?.checked) perms.push('control');`
);

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('✓ Successfully wrote updated public/app.html');
