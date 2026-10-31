import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

const targetFileOps = `    async function submitCreateDirectory() {
      const name = document.getElementById('input-dir-name').value.trim();
      if (!name) return notify('Please enter a directory name', 'error');
      const dirPath = currentSubpath ? \`\${currentSubpath}/\${name}\` : name;
      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/mkdir\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ path: dirPath })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create directory');
        notify('Directory created successfully', 'success');
        closeModal('modal-create-directory');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Move Modal
    function openMoveModal(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      document.getElementById('input-move-source').value = filePath;
      document.getElementById('move-source-display').innerText = filePath;
      document.getElementById('input-move-dest').value = currentSubpath || '';
      const modal = document.getElementById('modal-move-file');
      if (modal) {
        openModal('modal-move-file');
        setTimeout(() => document.getElementById('input-move-dest').focus(), 50);
      }
    }

    async function submitMoveFile() {
      const sourcePath = document.getElementById('input-move-source').value;
      const destinationDir = document.getElementById('input-move-dest').value.trim();
      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/move\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ sourcePath, destinationDir })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to move file');
        notify('Item moved successfully', 'success');
        closeModal('modal-move-file');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Rename Modal
    function openRenameModal(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      const baseName = filePath.split('/').pop();
      document.getElementById('input-rename-old').value = filePath;
      const input = document.getElementById('input-rename-new');
      input.value = baseName;
      const modal = document.getElementById('modal-rename-file');
      if (modal) {
        openModal('modal-rename-file');
        setTimeout(() => input.focus(), 50);
      }
    }

    async function submitRenameFile() {
      const oldPath = document.getElementById('input-rename-old').value;
      const newName = document.getElementById('input-rename-new').value.trim();
      if (!newName) return notify('Please enter a new name', 'error');
      const parts = oldPath.split('/');
      parts.pop();
      const newPath = parts.length > 0 ? \`\${parts.join('/')}/\${newName}\` : newName;
      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/rename\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ oldPath, newPath })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to rename item');
        notify('Renamed successfully', 'success');
        closeModal('modal-rename-file');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Permissions Modal
    function openPermissionsModal(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      document.getElementById('input-perm-file').value = filePath;
      document.getElementById('perm-file-display').innerText = filePath;
      const modal = document.getElementById('modal-permissions');
      if (modal) openModal('modal-permissions');
    }

    async function submitPermissions() {
      const filePath = document.getElementById('input-perm-file').value;
      const mode = document.getElementById('input-perm-mode').value.trim();
      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/permissions\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ filePath, mode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update permissions');
        notify('Permissions updated successfully', 'success');
        closeModal('modal-permissions');
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Duplicate File
    async function duplicateFile(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/duplicate\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ filePath })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to duplicate item');
        notify('Duplicated successfully', 'success');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }`;

const replaceFileOps = `    async function submitCreateDirectory() {
      const name = document.getElementById('input-dir-name').value.trim();
      if (!name) return notify('Please enter a directory name', 'error');
      const dirPath = currentSubpath ? \`\${currentSubpath}/\${name}\` : name;
      try {
        const res = await safeApi(\`\${API_BASE}/files/\${currentAppId}/mkdir\`, {
          method: 'POST',
          body: JSON.stringify({ path: dirPath })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to create directory');
        notify('Directory created successfully', 'success');
        closeModal('modal-create-directory');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Move Modal
    function openMoveModal(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      document.getElementById('input-move-source').value = filePath;
      document.getElementById('move-source-display').innerText = filePath;
      document.getElementById('input-move-dest').value = currentSubpath || '';
      const modal = document.getElementById('modal-move-file');
      if (modal) {
        openModal('modal-move-file');
        setTimeout(() => document.getElementById('input-move-dest').focus(), 50);
      }
    }

    async function submitMoveFile() {
      const sourcePath = document.getElementById('input-move-source').value;
      const destinationDir = document.getElementById('input-move-dest').value.trim();
      try {
        const res = await safeApi(\`\${API_BASE}/files/\${currentAppId}/move\`, {
          method: 'POST',
          body: JSON.stringify({ sourcePath, destinationDir })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to move file');
        notify('Item moved successfully', 'success');
        closeModal('modal-move-file');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Rename Modal
    function openRenameModal(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      const baseName = filePath.split('/').pop();
      document.getElementById('input-rename-old').value = filePath;
      const input = document.getElementById('input-rename-new');
      input.value = baseName;
      const modal = document.getElementById('modal-rename-file');
      if (modal) {
        openModal('modal-rename-file');
        setTimeout(() => input.focus(), 50);
      }
    }

    async function submitRenameFile() {
      const oldPath = document.getElementById('input-rename-old').value;
      const newName = document.getElementById('input-rename-new').value.trim();
      if (!newName) return notify('Please enter a new name', 'error');
      const parts = oldPath.split('/');
      parts.pop();
      const newPath = parts.length > 0 ? \`\${parts.join('/')}/\${newName}\` : newName;
      try {
        const res = await safeApi(\`\${API_BASE}/files/\${currentAppId}/rename\`, {
          method: 'POST',
          body: JSON.stringify({ oldPath, newPath })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to rename item');
        notify('Renamed successfully', 'success');
        closeModal('modal-rename-file');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Permissions Modal
    function openPermissionsModal(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      document.getElementById('input-perm-file').value = filePath;
      document.getElementById('perm-file-display').innerText = filePath;
      const modal = document.getElementById('modal-permissions');
      if (modal) openModal('modal-permissions');
    }

    async function submitPermissions() {
      const filePath = document.getElementById('input-perm-file').value;
      const mode = document.getElementById('input-perm-mode').value.trim();
      try {
        const res = await safeApi(\`\${API_BASE}/files/\${currentAppId}/permissions\`, {
          method: 'POST',
          body: JSON.stringify({ filePath, mode })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to update permissions');
        notify('Permissions updated successfully', 'success');
        closeModal('modal-permissions');
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // Duplicate File
    async function duplicateFile(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      try {
        const res = await safeApi(\`\${API_BASE}/files/\${currentAppId}/duplicate\`, {
          method: 'POST',
          body: JSON.stringify({ filePath })
        });
        if (!res.ok) throw new Error(res.data.error || 'Failed to duplicate item');
        notify('Duplicated successfully', 'success');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }`;

if (html.includes(targetFileOps)) {
  html = html.replace(targetFileOps, replaceFileOps);
  console.log('✓ Successfully replaced file operation functions with safeApi');
} else {
  console.warn('! targetFileOps not found');
}

fs.writeFileSync('public/app.html', html, 'utf8');
