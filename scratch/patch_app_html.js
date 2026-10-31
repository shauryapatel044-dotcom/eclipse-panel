import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
let appHtml = fs.readFileSync(appHtmlPath, 'utf8');

// 1. REPLACE PANE-FILES HTML
const filesStartMarker = '<!-- TAB 2: ADVANCED NEBULA FILE MANAGER & CODE STUDIO (demo.nebula.style) -->';
const filesEndMarker = '<!-- TAB: DATABASES -->';

const newFilesHtml = `<!-- TAB 2: AUTHENTIC NEBULA FILE MANAGER & CODE STUDIO (demo.nebula.style) -->
          <div id="pane-files" style="display: none;">
            <!-- VIEW 1: Full-Width Nebula File Explorer Table (Screenshot 212758) -->
            <div id="files-browser-view">
              <!-- Top Breadcrumbs & Action Buttons -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; font-family: var(--font-mono); font-size: 13px;">
                  <input type="checkbox" id="files-select-all" onchange="toggleSelectAllFiles(this.checked)" title="Select All" style="width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer;">
                  <div id="nebula-breadcrumbs" style="display: flex; align-items: center; gap: 6px; color: #7E8497;">
                    <!-- Dynamically generated breadcrumbs -->
                  </div>
                </div>

                <!-- Nebula Action Pill Buttons -->
                <div style="display: flex; align-items: center; gap: 10px;">
                  <button type="button" class="btn-secondary" onclick="openNewFolderPrompt()" style="border-radius: 20px; padding: 7px 16px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="bi bi-folder-plus"></i> Create Directory
                  </button>
                  <button type="button" class="btn-secondary" onclick="triggerFileUploadPrompt()" style="border-radius: 20px; padding: 7px 16px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="bi bi-cloud-arrow-up-fill"></i> Upload
                  </button>
                  <button type="button" class="btn-primary" onclick="openNewFilePrompt()" style="border-radius: 20px; padding: 7px 16px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="bi bi-file-earmark-plus"></i> New File
                  </button>
                  <input type="file" id="file-uploader" style="display: none;" multiple onchange="handleFileUpload(event)">
                </div>
              </div>

              <!-- Mass Action Selection Bar (appears when items are checked) -->
              <div id="files-mass-actions" style="display: none; align-items: center; justify-content: space-between; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 10px 18px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <i class="bi bi-check2-square" style="color: #F87171;"></i>
                  <span id="files-selected-count" style="font-size: 12px; font-weight: 700; color: #FFF; font-family: var(--font-mono);">0 items selected</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button type="button" class="btn-secondary" style="color: #F87171; border-color: rgba(239, 68, 68, 0.3); padding: 5px 14px; font-size: 12px;" onclick="deleteSelectedFiles()">
                    <i class="bi bi-trash3"></i> Delete Selected
                  </button>
                  <button type="button" class="quick-cmd-btn" onclick="clearFileSelection()">Deselect All</button>
                </div>
              </div>

              <!-- Full Width Files Table -->
              <div style="background: #141224; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; overflow: hidden;">
                <div style="display: grid; grid-template-columns: 44px 1fr 140px 180px 110px; align-items: center; padding: 12px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px; font-weight: 700; color: #7E8497; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-mono);">
                  <span></span>
                  <span>Name</span>
                  <span>Size</span>
                  <span>Last Modified</span>
                  <span style="text-align: right;">Actions</span>
                </div>
                <div id="nebula-files-list">
                  <div style="padding: 30px; text-align: center; color: #7E8497; font-family: var(--font-mono); font-size: 12px;">
                    <i class="bi bi-arrow-repeat spin"></i> Loading server workspace...
                  </div>
                </div>
              </div>
            </div>

            <!-- VIEW 2: Dedicated Nebula File Editor Canvas (demo.nebula.style) -->
            <div id="files-editor-view" style="display: none;">
              <!-- Topbar with Breadcrumbs, filename input, and buttons -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                  <button type="button" class="btn-secondary" onclick="closeFileEditor()" style="border-radius: 20px; padding: 6px 14px; font-size: 12px;">
                    <i class="bi bi-arrow-left"></i> Back to Files
                  </button>
                  <span class="nebula-studio-badge" id="editor-file-path-breadcrumb">/home/container/</span>
                  <input type="text" id="editor-filename-input" class="form-control" style="width: 220px; font-family: var(--font-mono); font-size: 12px; padding: 6px 10px; background: rgba(0,0,0,0.3);" placeholder="filename.ext">
                  <span class="nebula-studio-badge" id="editor-lang-badge">PLAIN TEXT</span>
                  <span class="nebula-studio-badge" style="color: var(--emerald);">UTF-8</span>
                  <span id="editor-save-indicator" style="font-size: 11px; color: #10B981; font-family: var(--font-mono); font-weight: 600;">✓ Saved</span>
                </div>

                <div style="display: flex; align-items: center; gap: 8px;">
                  <button type="button" class="btn-secondary" onclick="closeFileEditor()" style="border-radius: 20px; padding: 6px 14px; font-size: 12px;">Close</button>
                  <button type="button" class="btn-primary" id="btn-save-file" onclick="saveActiveFile()" style="border-radius: 20px; padding: 6px 18px; font-size: 12px;">
                    <i class="bi bi-floppy-fill"></i> Save Content (Ctrl+S)
                  </button>
                </div>
              </div>

              <!-- Synchronized Editor Workspace -->
              <div class="nebula-editor-workspace" style="min-height: 520px; height: calc(100vh - 340px); border-radius: 12px; background: #090814; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; overflow: hidden;">
                <div id="editor-gutter" class="nebula-editor-gutter" style="background: #0B0A16; border-right: 1px solid rgba(255,255,255,0.06); padding: 14px 10px; font-family: var(--font-mono); font-size: 12px; color: #555A6E; text-align: right; user-select: none; min-width: 48px; overflow: hidden; line-height: 1.6;">1</div>
                <textarea id="file-editor" class="nebula-editor-textarea" style="flex: 1; background: transparent; color: #E2E8F0; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; padding: 14px 16px; border: none; outline: none; resize: none; tab-size: 2; white-space: pre; overflow: auto;" spellcheck="false" placeholder="// Start typing or paste code here..."></textarea>
              </div>

              <!-- Statusbar -->
              <div class="nebula-studio-statusbar" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #7E8497; font-family: var(--font-mono); padding: 6px 10px;">
                <div>
                  <span id="editor-cursor-pos">Ln 1, Col 1</span>
                  <span style="margin: 0 6px; opacity: 0.4;">|</span>
                  <span id="editor-lines-total">1 lines</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span id="editor-char-count">0 characters</span>
                  <span style="opacity: 0.4;">|</span>
                  <span>Spaces: 2</span>
                </div>
              </div>
            </div>
          </div>\n\n          `;

const fStart = appHtml.indexOf(filesStartMarker);
const fEnd = appHtml.indexOf(filesEndMarker);

if (fStart !== -1 && fEnd !== -1) {
  appHtml = appHtml.slice(0, fStart) + newFilesHtml + appHtml.slice(fEnd);
  console.log('✓ pane-files HTML updated successfully');
} else {
  console.error('Failed to locate pane-files markers in app.html');
}

// 2. REPLACE PANE-STARTUP HTML
const startupStartMarker = '<!-- TAB 3: STARTUP & RUNTIME -->';
const startupEndMarker = '<div id="pane-settings" style="display: none;">';

const newStartupHtml = `<!-- TAB 3: STARTUP & RUNTIME (Screenshot 212825) -->
          <div id="pane-startup" style="display: none;">
            <div style="display: grid; grid-template-columns: 1.5fr 1.2fr; gap: 18px; margin-bottom: 24px;">
              <!-- Startup Command Card -->
              <div style="background: #141224; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; font-weight: 700; color: #FFF; margin: 0;">Startup Command</h3>
                  <button type="button" class="quick-cmd-btn" onclick="resetStartupToDefault()" title="Reset to runtime default command">
                    <i class="bi bi-arrow-counterclockwise"></i> Reset
                  </button>
                </div>
                <textarea id="startup-cmd-editor" class="form-control" style="background: #0B0A14; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 14px; font-family: var(--font-mono); font-size: 13px; color: #C084FC; resize: vertical; min-height: 80px; line-height: 1.5;" placeholder="node index.js">node index.js</textarea>
                <div style="font-size: 11px; color: #6E7387; margin-top: 8px;">
                  The supervisor command executed to start your server. Changing the runtime on the right dynamically modifies this command.
                </div>
              </div>

              <!-- Docker Image / Runtime & Version Card -->
              <div style="background: #141224; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px 24px;">
                <h3 style="font-size: 14px; font-weight: 700; color: #FFF; margin: 0 0 12px 0;">Docker Image / Runtime Environment</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                  <div>
                    <label style="font-size: 10px; font-weight: 700; color: #7E8497; text-transform: uppercase; display: block; margin-bottom: 4px;">Runtime Platform</label>
                    <select id="startup-type-select" class="form-control" onchange="handleRuntimeTypeChange(this.value)">
                      <option value="nodejs">Node.js (JavaScript / TypeScript)</option>
                      <option value="python">Python (FastAPI / Flask / Django)</option>
                      <option value="java">Java (Paper / Spigot / Spring)</option>
                      <option value="bun">Bun (High-Performance JS/TS)</option>
                      <option value="go">Go (Golang Runtime)</option>
                      <option value="custom">Custom / Shell Script</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-size: 10px; font-weight: 700; color: #7E8497; text-transform: uppercase; display: block; margin-bottom: 4px;">Engine Version</label>
                    <select id="startup-version-select" class="form-control" onchange="handleVersionChange(this.value)">
                      <!-- Dynamically populated -->
                    </select>
                  </div>
                </div>
                <div style="font-size: 11px; color: #6E7387; margin-top: 10px;">
                  This is an advanced feature allowing you to select a Docker image/runtime and version to use when running this server instance.
                </div>
              </div>
            </div>

            <!-- Variables Section (Screenshot 212825) -->
            <h2 style="font-size: 20px; font-weight: 800; color: #FFF; margin: 0 0 16px 0;">Variables</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <!-- Variable 1: Main/Jar file -->
              <div style="background: #141224; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 18px 22px;">
                <span style="font-size: 11px; font-weight: 700; color: #7E8497; text-transform: uppercase;">SERVER ENTRYPOINT FILE</span>
                <input type="text" id="startup-var-main" class="form-control" style="margin-top: 8px; font-family: var(--font-mono); font-size: 13px;" value="index.js" oninput="updateStartupCmdFromEntrypoint(this.value)">
                <div style="font-size: 11px; color: #6E7387; margin-top: 6px;">The name of the server entrypoint file or jarfile to run the server with.</div>
              </div>

              <!-- Variable 2: Arguments -->
              <div style="background: #141224; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 18px 22px;">
                <span style="font-size: 11px; font-weight: 700; color: #7E8497; text-transform: uppercase;">RUNTIME ARGUMENTS / FLAGS</span>
                <input type="text" id="startup-var-nodeargs" class="form-control" style="margin-top: 8px; font-family: var(--font-mono); font-size: 13px;" placeholder="e.g. --max-old-space-size=1024 or -u">
                <div style="font-size: 11px; color: #6E7387; margin-top: 6px;">Custom command-line flags and arguments passed directly on boot.</div>
              </div>

              <!-- Variable 3: Packages / Requirements -->
              <div style="background: #141224; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 18px 22px; grid-column: span 2;">
                <span style="font-size: 11px; font-weight: 700; color: #7E8497; text-transform: uppercase;">ADDITIONAL PACKAGES / REQUIREMENTS</span>
                <input type="text" id="startup-var-nodepkg" class="form-control" style="margin-top: 8px; font-family: var(--font-mono); font-size: 13px;" placeholder="e.g. express cors or requirements.txt">
                <div style="font-size: 11px; color: #6E7387; margin-top: 6px;">Auto-installed packages or dependencies manifest.</div>
              </div>
            </div>

            <div style="margin-top: 20px;">
              <button type="button" class="btn-primary" onclick="saveStartupConfig()" style="border-radius: 20px; padding: 9px 24px; font-size: 13px; font-weight: 700;">
                <i class="bi bi-check2-circle"></i> Save Startup Configuration
              </button>
            </div>
          </div>\n\n          `;

const sStart = appHtml.indexOf(startupStartMarker);
const sEnd = appHtml.indexOf(startupEndMarker);

if (sStart !== -1 && sEnd !== -1) {
  appHtml = appHtml.slice(0, sStart) + newStartupHtml + appHtml.slice(sEnd);
  console.log('✓ pane-startup HTML updated successfully');
} else {
  console.error('Failed to locate pane-startup markers in app.html');
}

fs.writeFileSync(appHtmlPath, appHtml, 'utf8');
console.log('HTML templates updated successfully.');
