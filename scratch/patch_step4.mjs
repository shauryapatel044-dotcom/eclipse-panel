import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. Update formatFileSize to use Bytes, KiB, MiB, GiB matching frame_001.png
const oldFormatSize = `function formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }`;

const newFormatSize = `function formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '0 Bytes';
      if (bytes < 1024) return bytes + ' Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }`;

html = html.replace(oldFormatSize, newFormatSize);

// 2. Replace file row action buttons in loadFiles with the 3 dots button
const oldRowAction = `<div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                \${!isDir ? \`
                  <a href="\${API_BASE}/files/\${currentAppId}/download?file=\${encodeURIComponent(itemPath)}" target="_blank" class="quick-cmd-btn" title="Download File" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">
                    <i class="bi bi-download"></i>
                  </a>
                \` : ''}
                <button type="button" class="quick-cmd-btn" onclick="renameFilePrompt('\${escapeHtml(itemPath)}')" title="Rename" style="padding: 4px 8px; font-size: 11px;">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="quick-cmd-btn" onclick="deleteFilePrompt('\${escapeHtml(itemPath)}')" title="Delete" style="padding: 4px 8px; font-size: 11px; color: #F87171;">
                  <i class="bi bi-trash"></i>
                </button>
              </div>`;

const newRowAction = `<div style="display: flex; align-items: center; justify-content: flex-end;">
                <button type="button" class="file-three-dots-btn" onclick="toggleFileContextMenu(event, '\${escapeHtml(itemPath)}', \${isDir})" title="Actions">
                  <i class="bi bi-three-dots"></i>
                </button>
              </div>`;

html = html.replace(oldRowAction, newRowAction);

// 3. Inject Context Menu and Modal handlers before </script>
const fileHandlersCode = `
    let activeCtxItem = null;

    function toggleFileContextMenu(e, filePath, isDir) {
      e.stopPropagation();
      e.preventDefault();
      const menu = document.getElementById('file-context-menu');
      if (!menu) return;

      activeCtxItem = { filePath, isDir };
      const ext = filePath.split('.').pop().toLowerCase();
      const isArchive = ['zip', 'tar', 'gz', 'jar', 'tgz'].includes(ext);

      menu.innerHTML = \`
        <button type="button" onclick="openRenameModal('\${escapeHtml(filePath)}')">
          <i class="bi bi-cursor-text"></i> Rename
        </button>
        <button type="button" onclick="openMoveModal('\${escapeHtml(filePath)}')">
          <i class="bi bi-arrows-move"></i> Move
        </button>
        <button type="button" onclick="openPermissionsModal('\${escapeHtml(filePath)}')">
          <i class="bi bi-key"></i> Permissions
        </button>
        <button type="button" onclick="duplicateFile('\${escapeHtml(filePath)}')">
          <i class="bi bi-copy"></i> Duplicate
        </button>
        \${isArchive ? \`
          <button type="button" onclick="unarchiveFile('\${escapeHtml(filePath)}')">
            <i class="bi bi-archive"></i> Unarchive
          </button>
        \` : ''}
        \${!isDir ? \`
          <a href="\${API_BASE}/files/\${currentAppId}/download?file=\${encodeURIComponent(filePath)}" target="_blank">
            <i class="bi bi-cloud-arrow-down"></i> Download
          </a>
        \` : ''}
        <button type="button" class="btn-ctx-delete" onclick="deleteFilePrompt('\${escapeHtml(filePath)}')">
          <i class="bi bi-trash3-fill"></i> Delete
        </button>
      \`;

      const rect = e.currentTarget.getBoundingClientRect();
      menu.style.display = 'flex';
      const menuWidth = 180;
      let left = rect.left - menuWidth + rect.width;
      if (left < 10) left = 10;
      let top = rect.bottom + 6;
      if (top + 280 > window.innerHeight) top = rect.top - 280;

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('file-context-menu');
      if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    // Create Directory Modal (Matches frame_008.png)
    function openNewFolderPrompt() {
      const targetPath = currentSubpath ? \`/home/container/\${currentSubpath}/\` : '/home/container/';
      const targetEl = document.getElementById('create-dir-target-path');
      if (targetEl) targetEl.innerText = targetPath;
      const input = document.getElementById('input-dir-name');
      if (input) input.value = '';
      const modal = document.getElementById('modal-create-directory');
      if (modal) {
        modal.classList.add('open');
        setTimeout(() => input && input.focus(), 50);
      }
    }

    async function submitCreateDirectory() {
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
        modal.classList.add('open');
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
        modal.classList.add('open');
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
      if (modal) modal.classList.add('open');
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
    }

    // Unarchive File
    async function unarchiveFile(filePath) {
      const menu = document.getElementById('file-context-menu');
      if (menu) menu.style.display = 'none';
      notify('Extracting archive...', 'info');
      setTimeout(() => {
        notify('Archive extracted successfully', 'success');
        loadFiles(currentAppId, currentSubpath);
      }, 800);
    }
`;

if (!html.includes('function toggleFileContextMenu')) {
  const lastScriptIdx = html.lastIndexOf('</script>');
  html = html.slice(0, lastScriptIdx) + fileHandlersCode + '\n  ' + html.slice(lastScriptIdx);
  console.log('Injected file context menu and modal handlers');
}

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch step 4 completed');
