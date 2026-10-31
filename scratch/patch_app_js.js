import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
let appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const startMarker = '// STARTUP TAB LOGIC';
const endMarker = '    // ACTION RUNNER';

const startIdx = appHtml.indexOf(startMarker);
const endIdx = appHtml.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Failed to locate markers:', { startIdx, endIdx });
  process.exit(1);
}

const newJsCode = `// STARTUP TAB LOGIC & RUNTIME PRESETS
    const RUNTIME_PRESETS = {
      nodejs: {
        name: 'Node.js',
        defaultCmd: 'node index.js',
        entrypoint: 'index.js',
        versions: [
          { id: '22', label: 'Node.js 22 (Current)' },
          { id: '20', label: 'Node.js 20 (LTS Iron)' },
          { id: '18', label: 'Node.js 18 (LTS Hydrogen)' },
          { id: '24', label: 'Node.js 24 (Active)' }
        ]
      },
      python: {
        name: 'Python',
        defaultCmd: 'python main.py',
        entrypoint: 'main.py',
        versions: [
          { id: '3.12', label: 'Python 3.12 (Latest)' },
          { id: '3.11', label: 'Python 3.11 (Recommended)' },
          { id: '3.10', label: 'Python 3.10 (Standard)' },
          { id: '3.9', label: 'Python 3.9 (Legacy)' }
        ]
      },
      java: {
        name: 'Java',
        defaultCmd: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar server.jar',
        entrypoint: 'server.jar',
        versions: [
          { id: '21', label: 'Java 21 (LTS Modern)' },
          { id: '17', label: 'Java 17 (LTS Standard)' },
          { id: '11', label: 'Java 11 (Legacy)' },
          { id: '8', label: 'Java 8 (Legacy)' }
        ]
      },
      bun: {
        name: 'Bun',
        defaultCmd: 'bun run index.ts',
        entrypoint: 'index.ts',
        versions: [
          { id: '1.1', label: 'Bun 1.1 (High Performance)' },
          { id: '1.0', label: 'Bun 1.0 (Standard)' }
        ]
      },
      go: {
        name: 'Go',
        defaultCmd: 'go run main.go',
        entrypoint: 'main.go',
        versions: [
          { id: '1.22', label: 'Go 1.22 (Modern)' },
          { id: '1.21', label: 'Go 1.21 (Standard)' }
        ]
      },
      custom: {
        name: 'Custom',
        defaultCmd: './start.sh',
        entrypoint: 'start.sh',
        versions: [
          { id: 'latest', label: 'Custom Environment' }
        ]
      }
    };

    function updateVersionOptions(type, selectedVersion = '') {
      const select = document.getElementById('startup-version-select');
      if (!select) return;
      const preset = RUNTIME_PRESETS[type] || RUNTIME_PRESETS.nodejs;
      select.innerHTML = preset.versions.map(v => 
        \`<option value="\${v.id}" \${v.id === String(selectedVersion) ? 'selected' : ''}>\${v.label}</option>\`
      ).join('');
    }

    function handleRuntimeTypeChange(type) {
      const preset = RUNTIME_PRESETS[type] || RUNTIME_PRESETS.nodejs;
      updateVersionOptions(type);
      
      const cmdEditor = document.getElementById('startup-cmd-editor');
      const mainInput = document.getElementById('startup-var-main');
      
      if (cmdEditor) {
        cmdEditor.value = preset.defaultCmd;
        cmdEditor.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
        cmdEditor.style.borderColor = '#A855F7';
        cmdEditor.style.boxShadow = '0 0 15px rgba(168, 85, 247, 0.4)';
        setTimeout(() => {
          cmdEditor.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          cmdEditor.style.boxShadow = 'none';
        }, 1000);
      }
      
      if (mainInput) {
        mainInput.value = preset.entrypoint;
      }
      notify(\`Runtime switched to \${preset.name}. Startup command automatically updated.\`, 'info');
    }

    function handleVersionChange(version) {
      // Version changed callback
    }

    function updateStartupCmdFromEntrypoint(entry) {
      const type = document.getElementById('startup-type-select')?.value || 'nodejs';
      const cmdEditor = document.getElementById('startup-cmd-editor');
      if (!cmdEditor) return;
      const cleanEntry = entry.trim();
      if (!cleanEntry) return;

      if (type === 'nodejs') {
        cmdEditor.value = \`node \${cleanEntry}\`;
      } else if (type === 'python') {
        cmdEditor.value = \`python \${cleanEntry}\`;
      } else if (type === 'java') {
        cmdEditor.value = \`java -Xms128M -XX:MaxRAMPercentage=95.0 -jar \${cleanEntry}\`;
      } else if (type === 'bun') {
        cmdEditor.value = \`bun run \${cleanEntry}\`;
      } else if (type === 'go') {
        cmdEditor.value = \`go run \${cleanEntry}\`;
      } else {
        cmdEditor.value = \`./\${cleanEntry}\`;
      }
    }

    function resetStartupToDefault() {
      const type = document.getElementById('startup-type-select')?.value || 'nodejs';
      const preset = RUNTIME_PRESETS[type] || RUNTIME_PRESETS.nodejs;
      const cmdEditor = document.getElementById('startup-cmd-editor');
      const mainInput = document.getElementById('startup-var-main');
      if (cmdEditor) cmdEditor.value = preset.defaultCmd;
      if (mainInput) mainInput.value = preset.entrypoint;
      notify(\`Reset startup command to default for \${preset.name}.\`, 'info');
    }

    async function loadStartupConfig(appId) {
      try {
        const res = await fetch(\`\${API_BASE}/apps/\${appId}/startup\`, { headers: getHeaders() });
        if (!res.ok) return;
        const { startup } = await res.json();

        const typeSelect = document.getElementById('startup-type-select');
        if (typeSelect) typeSelect.value = startup.type || 'nodejs';

        updateVersionOptions(startup.type || 'nodejs', startup.runtime_version);

        const preset = RUNTIME_PRESETS[startup.type] || RUNTIME_PRESETS.nodejs;
        const cmdEditor = document.getElementById('startup-cmd-editor');
        if (cmdEditor) {
          cmdEditor.value = startup.startup_cmd || preset.defaultCmd;
        }

        const mainInput = document.getElementById('startup-var-main');
        if (mainInput) {
          mainInput.value = startup.main_file || preset.entrypoint;
        }

        const argsInput = document.getElementById('startup-var-nodeargs');
        if (argsInput) {
          argsInput.value = startup.node_args || '';
        }

        const pkgInput = document.getElementById('startup-var-nodepkg');
        if (pkgInput) {
          pkgInput.value = startup.node_packages || '';
        }
      } catch (e) {
        console.error('Load startup error:', e);
      }
    }

    async function saveStartupConfig() {
      if (!currentAppId) return;
      const type = document.getElementById('startup-type-select')?.value || 'nodejs';
      const runtime_version = document.getElementById('startup-version-select')?.value || '';
      const startup_cmd = document.getElementById('startup-cmd-editor')?.value || '';
      const main_file = document.getElementById('startup-var-main')?.value.trim() || '';
      const node_args = document.getElementById('startup-var-nodeargs')?.value.trim() || '';
      const node_packages = document.getElementById('startup-var-nodepkg')?.value.trim() || '';

      try {
        const res = await fetch(\`\${API_BASE}/apps/\${currentAppId}/startup\`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ type, runtime_version, startup_cmd, main_file, node_args, node_packages })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to save startup configuration');
        notify('Startup configuration successfully updated!', 'success');

        // Update runtime pill in hero title
        const pill = document.getElementById('hero-runtime-pill');
        if (pill) {
          const preset = RUNTIME_PRESETS[type] || { name: type };
          pill.innerText = \`\${preset.name} \${runtime_version ? 'v' + runtime_version : ''}\`.trim();
        }
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    // AUTHENTIC NEBULA FILE MANAGER LOGIC (demo.nebula.style)
    let currentSubpath = '';
    let selectedFiles = new Set();
    let activeFile = null;

    function renderBreadcrumbs(subpath) {
      const container = document.getElementById('nebula-breadcrumbs');
      if (!container) return;

      const parts = subpath.split('/').filter(Boolean);
      let html = \`
        <span onclick="navigateDir('')" style="cursor: pointer; color: #FFF; font-weight: 700; transition: color 0.15s;" onmouseover="this.style.color='#A855F7'" onmouseout="this.style.color='#FFF'">
          / home
        </span>
        <span style="opacity: 0.4;">/</span>
        <span onclick="navigateDir('')" style="cursor: pointer; color: #FFF; font-weight: 700; transition: color 0.15s;" onmouseover="this.style.color='#A855F7'" onmouseout="this.style.color='#FFF'">
          container
        </span>
        <span style="opacity: 0.4;">/</span>
      \`;

      let built = '';
      parts.forEach((p, idx) => {
        built += (built ? '/' : '') + p;
        const isLast = idx === parts.length - 1;
        const target = built;
        if (isLast) {
          html += \`<span style="color: #A855F7; font-weight: 700;">\${escapeHtml(p)}</span><span style="opacity: 0.4;"> /</span>\`;
        } else {
          html += \`
            <span onclick="navigateDir('\${escapeHtml(target)}')" style="cursor: pointer; color: #FFF; transition: color 0.15s;" onmouseover="this.style.color='#A855F7'" onmouseout="this.style.color='#FFF'">
              \${escapeHtml(p)}
            </span>
            <span style="opacity: 0.4;">/</span>
          \`;
        }
      });

      container.innerHTML = html;
    }

    function navigateDir(subpath) {
      currentSubpath = subpath || '';
      loadFiles(currentAppId, currentSubpath);
    }

    function toggleSelectAllFiles(checked) {
      const checkboxes = document.querySelectorAll('.file-row-checkbox');
      selectedFiles.clear();
      checkboxes.forEach(cb => {
        cb.checked = checked;
        if (checked && cb.dataset.path) {
          selectedFiles.add(cb.dataset.path);
        }
      });
      updateMassActionsBar();
    }

    function toggleSelectFile(itemPath, checked) {
      if (checked) {
        selectedFiles.add(itemPath);
      } else {
        selectedFiles.delete(itemPath);
      }
      updateMassActionsBar();
    }

    function clearFileSelection() {
      selectedFiles.clear();
      const allCb = document.getElementById('files-select-all');
      if (allCb) allCb.checked = false;
      document.querySelectorAll('.file-row-checkbox').forEach(cb => cb.checked = false);
      updateMassActionsBar();
    }

    function updateMassActionsBar() {
      const bar = document.getElementById('files-mass-actions');
      const countEl = document.getElementById('files-selected-count');
      if (!bar) return;

      if (selectedFiles.size > 0) {
        bar.style.display = 'flex';
        if (countEl) countEl.innerText = \`\${selectedFiles.size} item\${selectedFiles.size > 1 ? 's' : ''} selected\`;
      } else {
        bar.style.display = 'none';
        const allCb = document.getElementById('files-select-all');
        if (allCb) allCb.checked = false;
      }
    }

    async function deleteSelectedFiles() {
      if (selectedFiles.size === 0) return;
      if (!confirm(\`Are you sure you want to permanently delete these \${selectedFiles.size} selected item(s)?\`)) return;

      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/mass-delete\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ files: Array.from(selectedFiles) })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to delete selected items');
        notify(d.message || 'Selected items deleted', 'success');
        clearFileSelection();
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    function formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatFileDate(dateStr) {
      if (!dateStr) return '--';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '--';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async function loadFiles(appId, subpath = '') {
      if (!appId) return;
      currentSubpath = subpath;
      renderBreadcrumbs(subpath);
      clearFileSelection();

      const list = document.getElementById('nebula-files-list');
      if (!list) return;

      try {
        const url = \`\${API_BASE}/files/\${appId}/list?path=\${encodeURIComponent(subpath)}\`;
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load file list');
        const data = await res.json();

        const files = data.files || [];
        let rowsHtml = '';

        // If in subfolder, render ".." parent link
        if (subpath) {
          const parentParts = subpath.split('/').filter(Boolean);
          parentParts.pop();
          const parentPath = parentParts.join('/');
          rowsHtml += \`
            <div style="display: grid; grid-template-columns: 44px 1fr 140px 180px 110px; align-items: center; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.03); background: rgba(255,255,255,0.01); cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(122,152,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.01)'" onclick="navigateDir('\${escapeHtml(parentPath)}')">
              <span></span>
              <div style="display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: #7A98FF;">
                <i class="bi bi-arrow-90deg-up" style="font-size: 15px;"></i>
                <span>.. (Up one directory)</span>
              </div>
              <span style="color: #6E7387; font-size: 12px; font-family: var(--font-mono);">-</span>
              <span style="color: #6E7387; font-size: 12px; font-family: var(--font-mono);">-</span>
              <span></span>
            </div>
          \`;
        }

        if (files.length === 0 && !subpath) {
          list.innerHTML = \`
            <div style="padding: 40px 20px; text-align: center; color: #7E8497; font-family: var(--font-mono); font-size: 13px;">
              <i class="bi bi-folder2-open" style="font-size: 32px; display: block; margin-bottom: 10px; opacity: 0.5;"></i>
              This directory is empty. Use "New File" or "Upload" to get started.
            </div>
          \`;
          return;
        }

        files.forEach(f => {
          const itemPath = subpath ? \`\${subpath}/\${f.name}\` : f.name;
          const isDir = !!f.isDirectory;
          const iconHtml = getFileIcon(f.name, isDir);
          const sizeText = isDir ? '-' : formatFileSize(f.size);
          const modText = formatFileDate(f.updatedAt);

          const clickAction = isDir 
            ? \`navigateDir('\${escapeHtml(itemPath)}')\` 
            : \`openFile('\${escapeHtml(itemPath)}')\`;

          rowsHtml += \`
            <div style="display: grid; grid-template-columns: 44px 1fr 140px 180px 110px; align-items: center; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s; font-family: var(--font-mono);" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <div style="display: flex; align-items: center;">
                <input type="checkbox" class="file-row-checkbox" data-path="\${escapeHtml(itemPath)}" onchange="toggleSelectFile('\${escapeHtml(itemPath)}', this.checked)" style="width: 15px; height: 15px; accent-color: var(--primary); cursor: pointer;">
              </div>
              <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; min-width: 0; overflow: hidden;" onclick="\${clickAction}" title="\${isDir ? 'Open folder' : 'Edit file in Nebula Editor'}">
                <span style="font-size: 16px; flex-shrink: 0;">\${iconHtml}</span>
                <span style="font-weight: 600; font-size: 13px; color: \${isDir ? '#93C5FD' : '#E2E8F0'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 0.15s;" onmouseover="this.style.color='#C084FC'" onmouseout="this.style.color='\${isDir ? '#93C5FD' : '#E2E8F0'}'">
                  \${escapeHtml(f.name)}
                </span>
              </div>
              <span style="color: #94A3B8; font-size: 12px;">\${sizeText}</span>
              <span style="color: #64748B; font-size: 12px;">\${modText}</span>
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                \${!isDir ? \`
                  <a href="\${API_BASE}/files/\${currentAppId}/download?file=\${encodeURIComponent(itemPath)}" target="_blank" class="quick-cmd-btn" title="Download File" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">
                    <i class="bi bi-download"></i>
                  </a>
                \` : ''}
                <button type="button" class="quick-cmd-btn" onclick="renameFilePrompt('\${escapeHtml(itemPath)}')" title="Rename" style="padding: 4px 8px; font-size: 11px;">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="quick-cmd-btn" onclick="deleteFilePrompt('\${escapeHtml(itemPath)}')" title="Delete" style="padding: 4px 8px; font-size: 11px; color: #F87171;">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </div>
          \`;
        });

        list.innerHTML = rowsHtml;
      } catch (e) {
        list.innerHTML = \`<div style="padding: 20px; color: #F87171; font-family: var(--font-mono); font-size: 12px; text-align: center;">Error loading files: \${escapeHtml(e.message)}</div>\`;
      }
    }

    async function openFile(itemPath) {
      if (!currentAppId) return;
      activeFile = itemPath;

      const browserView = document.getElementById('files-browser-view');
      const editorView = document.getElementById('files-editor-view');
      if (browserView) browserView.style.display = 'none';
      if (editorView) editorView.style.display = 'block';

      const fileName = itemPath.split('/').pop();
      const parentDir = itemPath.includes('/') ? itemPath.substring(0, itemPath.lastIndexOf('/')) : '';

      const nameInput = document.getElementById('editor-filename-input');
      if (nameInput) nameInput.value = fileName;

      const pathBread = document.getElementById('editor-file-path-breadcrumb');
      if (pathBread) pathBread.innerText = \`/home/container/\${parentDir ? parentDir + '/' : ''}\`;

      const langBadge = document.getElementById('editor-lang-badge');
      if (langBadge) langBadge.innerText = getFileLang(fileName);

      const saveInd = document.getElementById('editor-save-indicator');
      if (saveInd) {
        saveInd.innerText = '● Loading...';
        saveInd.style.color = '#F59E0B';
      }

      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/content?file=\${encodeURIComponent(itemPath)}\`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load file content');
        const data = await res.json();
        const editor = document.getElementById('file-editor');
        if (editor) {
          editor.value = data.content || '';
          updateEditorStats();
        }
        if (saveInd) {
          saveInd.innerText = '✓ Saved';
          saveInd.style.color = '#10B981';
        }
      } catch (e) {
        notify(e.message, 'error');
        if (saveInd) {
          saveInd.innerText = '⚠ Error';
          saveInd.style.color = '#EF4444';
        }
      }
    }

    function closeFileEditor() {
      const browserView = document.getElementById('files-browser-view');
      const editorView = document.getElementById('files-editor-view');
      if (editorView) editorView.style.display = 'none';
      if (browserView) browserView.style.display = 'block';
      activeFile = null;
      loadFiles(currentAppId, currentSubpath);
    }

    function openNewFilePrompt() {
      if (!currentAppId) return;
      activeFile = null;

      const browserView = document.getElementById('files-browser-view');
      const editorView = document.getElementById('files-editor-view');
      if (browserView) browserView.style.display = 'none';
      if (editorView) editorView.style.display = 'block';

      const nameInput = document.getElementById('editor-filename-input');
      if (nameInput) {
        nameInput.value = 'untitled.js';
        nameInput.focus();
        nameInput.select();
      }

      const pathBread = document.getElementById('editor-file-path-breadcrumb');
      if (pathBread) pathBread.innerText = \`/home/container/\${currentSubpath ? currentSubpath + '/' : ''}\`;

      const langBadge = document.getElementById('editor-lang-badge');
      if (langBadge) langBadge.innerText = 'JAVASCRIPT';

      const editor = document.getElementById('file-editor');
      if (editor) {
        editor.value = '';
        updateEditorStats();
      }

      const saveInd = document.getElementById('editor-save-indicator');
      if (saveInd) {
        saveInd.innerText = '● Unsaved';
        saveInd.style.color = '#F59E0B';
      }
    }

    async function saveActiveFile() {
      if (!currentAppId) return;
      const nameInput = document.getElementById('editor-filename-input');
      const fileName = nameInput ? nameInput.value.trim() : '';
      if (!fileName) return notify('Please enter a valid file name', 'error');

      const targetPath = currentSubpath ? \`\${currentSubpath}/\${fileName}\` : fileName;
      const content = document.getElementById('file-editor')?.value || '';
      const saveBtn = document.getElementById('btn-save-file');
      const saveInd = document.getElementById('editor-save-indicator');

      if (saveBtn) saveBtn.disabled = true;
      if (saveInd) {
        saveInd.innerText = '● Saving...';
        saveInd.style.color = '#F59E0B';
      }

      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/content\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ file: targetPath, content })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to save file');

        activeFile = targetPath;
        notify(\`File "\${fileName}" saved successfully!\`, 'success');
        if (saveInd) {
          saveInd.innerText = '✓ Saved';
          saveInd.style.color = '#10B981';
        }
      } catch (e) {
        notify(e.message, 'error');
        if (saveInd) {
          saveInd.innerText = '⚠ Save Failed';
          saveInd.style.color = '#EF4444';
        }
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    }

    function triggerFileUploadPrompt() {
      const uploader = document.getElementById('file-uploader');
      if (uploader) uploader.click();
    }

    async function handleFileUpload(event) {
      if (!currentAppId) return;
      const files = event.target.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const targetPath = currentSubpath ? \`\${currentSubpath}/\${file.name}\` : file.name;
        const reader = new FileReader();
        const isBinary = !file.name.match(/\\.(js|ts|py|txt|json|env|md|html|css|yaml|yml|sh|bash|xml|properties|ini)$/i);

        await new Promise((resolve) => {
          reader.onload = async function() {
            let content = reader.result;
            let isBase64 = false;
            if (isBinary) {
              content = content.split(',')[1];
              isBase64 = true;
            }
            try {
              const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/upload\`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ path: targetPath, content, isBase64 })
              });
              if (res.ok) {
                notify(\`Uploaded "\${file.name}"\`, 'success');
              } else {
                const d = await res.json();
                notify(\`Failed uploading "\${file.name}": \${d.error || 'Error'}\`, 'error');
              }
            } catch (err) {
              notify(err.message, 'error');
            }
            resolve();
          };

          if (isBinary) reader.readAsDataURL(file);
          else reader.readAsText(file);
        });
      }

      event.target.value = '';
      loadFiles(currentAppId, currentSubpath);
    }

    async function openNewFolderPrompt() {
      if (!currentAppId) return;
      const folderName = prompt('Enter new directory name (e.g. src, config, plugins):');
      if (!folderName || !folderName.trim()) return;

      const targetPath = currentSubpath ? \`\${currentSubpath}/\${folderName.trim()}\` : folderName.trim();
      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/mkdir\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ path: targetPath })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to create directory');
        notify(\`Created directory "\${folderName.trim()}"\`, 'success');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    async function renameFilePrompt(itemPath) {
      if (!currentAppId || !itemPath) return;
      const currentName = itemPath.split('/').pop();
      const newName = prompt(\`Rename "\${currentName}" to:\`, currentName);
      if (!newName || newName.trim() === currentName) return;

      const parentDir = itemPath.includes('/') ? itemPath.substring(0, itemPath.lastIndexOf('/')) : '';
      const newPath = parentDir ? \`\${parentDir}/\${newName.trim()}\` : newName.trim();

      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/rename\`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ oldPath: itemPath, newPath })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Rename failed');
        notify(\`Renamed to "\${newName.trim()}"\`, 'success');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    async function deleteFilePrompt(itemPath) {
      if (!currentAppId || !itemPath) return;
      const name = itemPath.split('/').pop();
      if (!confirm(\`Are you sure you want to permanently delete "\${name}"?\`)) return;

      try {
        const res = await fetch(\`\${API_BASE}/files/\${currentAppId}/delete?file=\${encodeURIComponent(itemPath)}\`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Delete failed');
        notify(\`Deleted "\${name}"\`, 'success');
        loadFiles(currentAppId, currentSubpath);
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    function getFileIcon(name, isDir) {
      if (isDir) return '<i class="bi bi-folder-fill" style="color: #60A5FA;"></i>';
      const ext = name.split('.').pop().toLowerCase();
      if (name.startsWith('.env') || name === 'Dockerfile') return '<i class="bi bi-gear-wide-connected" style="color: #EC4899;"></i>';
      if (['js', 'mjs', 'cjs'].includes(ext)) return '<i class="bi bi-filetype-js" style="color: #FACC15;"></i>';
      if (['ts', 'tsx'].includes(ext)) return '<i class="bi bi-filetype-tsx" style="color: #38BDF8;"></i>';
      if (['py'].includes(ext)) return '<i class="bi bi-filetype-py" style="color: #38BDF8;"></i>';
      if (['java', 'jar', 'class'].includes(ext)) return '<i class="bi bi-filetype-java" style="color: #F87171;"></i>';
      if (['json'].includes(ext)) return '<i class="bi bi-filetype-json" style="color: #F59E0B;"></i>';
      if (['html'].includes(ext)) return '<i class="bi bi-filetype-html" style="color: #FB923C;"></i>';
      if (['css', 'scss'].includes(ext)) return '<i class="bi bi-filetype-css" style="color: #38BDF8;"></i>';
      if (['md'].includes(ext)) return '<i class="bi bi-filetype-md" style="color: #A78BFA;"></i>';
      if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return '<i class="bi bi-file-earmark-zip" style="color: #F43F5E;"></i>';
      if (['sh', 'bat', 'cmd'].includes(ext)) return '<i class="bi bi-terminal" style="color: #34D399;"></i>';
      return '<i class="bi bi-file-earmark-code" style="color: #94A3B8;"></i>';
    }

    function getFileLang(name) {
      const ext = name.split('.').pop().toLowerCase();
      if (['js', 'mjs', 'cjs'].includes(ext)) return 'JAVASCRIPT';
      if (['ts', 'tsx'].includes(ext)) return 'TYPESCRIPT';
      if (['py'].includes(ext)) return 'PYTHON 3';
      if (['java', 'jar'].includes(ext)) return 'JAVA';
      if (['json'].includes(ext)) return 'JSON';
      if (['html'].includes(ext)) return 'HTML';
      if (['css', 'scss'].includes(ext)) return 'CSS';
      if (['md'].includes(ext)) return 'MARKDOWN';
      if (['sh', 'bash'].includes(ext)) return 'SHELL SCRIPT';
      if (name.startsWith('.env')) return 'ENV CONFIG';
      return 'PLAIN TEXT';
    }

    function updateEditorStats() {
      const editor = document.getElementById('file-editor');
      const gutter = document.getElementById('editor-gutter');
      const linesTotal = document.getElementById('editor-lines-total');
      const charCount = document.getElementById('editor-char-count');
      const cursorPos = document.getElementById('editor-cursor-pos');
      if (!editor) return;

      const val = editor.value || '';
      const lines = val.split('\\n');
      const lineCount = lines.length;

      if (gutter) {
        gutter.innerHTML = Array.from({ length: lineCount }, (_, i) => i + 1).join('<br/>');
      }
      if (linesTotal) linesTotal.innerText = \`\${lineCount} lines\`;
      if (charCount) charCount.innerText = \`\${val.length.toLocaleString()} characters\`;

      if (cursorPos) {
        const selStart = editor.selectionStart || 0;
        const textBefore = val.substring(0, selStart);
        const curLine = textBefore.split('\\n').length;
        const curCol = textBefore.length - textBefore.lastIndexOf('\\n');
        cursorPos.innerText = \`Ln \${curLine}, Col \${curCol}\`;
      }
    }

    function initNebulaEditor() {
      const editor = document.getElementById('file-editor');
      const gutter = document.getElementById('editor-gutter');
      if (!editor) return;

      editor.addEventListener('input', () => {
        updateEditorStats();
        const saveInd = document.getElementById('editor-save-indicator');
        if (saveInd) {
          saveInd.innerText = '● Unsaved';
          saveInd.style.color = '#F59E0B';
        }
      });
      editor.addEventListener('click', updateEditorStats);
      editor.addEventListener('keyup', updateEditorStats);

      editor.addEventListener('scroll', () => {
        if (gutter) gutter.scrollTop = editor.scrollTop;
      });

      // Tab indentation & auto-indent
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          const val = editor.value;

          if (!e.shiftKey) {
            editor.value = val.substring(0, start) + '  ' + val.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 2;
          } else {
            const lineStart = val.lastIndexOf('\\n', start - 1) + 1;
            if (val.substring(lineStart, lineStart + 2) === '  ') {
              editor.value = val.substring(0, lineStart) + val.substring(lineStart + 2);
              editor.selectionStart = editor.selectionEnd = Math.max(lineStart, start - 2);
            }
          }
          updateEditorStats();
        } else if (e.key === 'Enter') {
          const start = editor.selectionStart;
          const val = editor.value;
          const lineStart = val.lastIndexOf('\\n', start - 1) + 1;
          const lineText = val.substring(lineStart, start);
          const match = lineText.match(/^\\s+/);
          if (match) {
            e.preventDefault();
            const indent = match[0];
            editor.value = val.substring(0, start) + '\\n' + indent + val.substring(start);
            editor.selectionStart = editor.selectionEnd = start + 1 + indent.length;
            updateEditorStats();
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          saveActiveFile();
        }
      });
    }\n\n`;

appHtml = appHtml.slice(0, startIdx) + newJsCode + appHtml.slice(endIdx);
fs.writeFileSync(appHtmlPath, appHtml, 'utf8');
console.log('✓ JavaScript logic updated successfully');
