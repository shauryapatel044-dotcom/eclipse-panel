import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. REPLACE PANE-STARTUP
const startIdx = html.indexOf('<div id="pane-startup"');
const startEnd = html.indexOf('<div id="pane-settings"', startIdx);

const newStartupHtml = `<div id="pane-startup" style="display: none;">
            <!-- Header with Auto-Save Badge -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
              <div>
                <h2 style="font-size: 22px; font-weight: 800; color: #FFF; margin: 0; letter-spacing: -0.02em;">Startup Configuration</h2>
                <p style="font-size: 13px; color: #94A3B8; margin-top: 4px;">Configure the container runtime image, engine version, and entrypoint variables.</p>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span id="startup-autosave-indicator" style="font-size: 12px; font-weight: 700; color: #10B981; display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 5px 12px; border-radius: 20px; font-family: var(--font-mono);">
                  <i class="bi bi-check-circle-fill"></i> Auto-saved
                </span>
                <button type="button" class="btn-secondary" onclick="resetStartupToDefault()" style="border-radius: 20px; padding: 6px 14px; font-size: 12px;" title="Reset configuration to runtime defaults">
                  <i class="bi bi-arrow-counterclockwise"></i> Reset Defaults
                </button>
              </div>
            </div>

            <!-- Top Grid: Active Command Preview & Runtime Selector -->
            <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-bottom: 24px;">
              <!-- Command Preview (Clean, No messy shell scripts) -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                <div style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
                  GENERATED STARTUP INSTRUCTION
                </div>
                <div id="startup-preview-cmd" style="background: #0A0B14; border: 1px solid rgba(6, 182, 212, 0.25); border-radius: 10px; padding: 14px 16px; font-family: var(--font-mono); font-size: 13px; color: #22D3EE; line-height: 1.6; word-break: break-all;">
                  node index.js
                </div>
                <div style="font-size: 12px; color: #64748B; margin-top: 10px;">
                  The supervisor command executed on boot. Updating the runtime or entrypoint file below automatically updates and auto-saves this command.
                </div>
              </div>

              <!-- Runtime Platform & Engine Version -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                <div style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px;">
                  CONTAINER RUNTIME & ENGINE
                </div>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                  <div>
                    <label style="font-size: 11px; font-weight: 700; color: #CBD5E1; display: block; margin-bottom: 6px;">Runtime Environment</label>
                    <select id="startup-type-select" class="form-control" style="font-size: 13px; font-weight: 600;" onchange="handleRuntimeTypeChange(this.value); autoSaveStartupConfig();">
                      <option value="nodejs">Node.js (JavaScript / TypeScript)</option>
                      <option value="python">Python (FastAPI / Flask / Django)</option>
                      <option value="java">Java (Minecraft Paper / Spring Boot)</option>
                      <option value="bun">Bun (High-Performance JS/TS Engine)</option>
                      <option value="go">Go (Golang Web Services)</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-size: 11px; font-weight: 700; color: #CBD5E1; display: block; margin-bottom: 6px;">Engine Version</label>
                    <select id="startup-version-select" class="form-control" style="font-size: 13px; font-weight: 600;" onchange="handleVersionChange(this.value); autoSaveStartupConfig();">
                      <!-- Populated dynamically -->
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Variables Section -->
            <h3 style="font-size: 16px; font-weight: 800; color: #FFF; margin: 0 0 16px 0; letter-spacing: -0.01em;">Execution Variables</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
              <!-- Entrypoint -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 20px 22px;">
                <span style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">MAIN ENTRYPOINT FILE</span>
                <input type="text" id="startup-var-main" class="form-control" style="margin-top: 8px; font-family: var(--font-mono); font-size: 13px;" value="index.js" oninput="updateStartupCmdFromEntrypoint(this.value); triggerAutoSaveStartup();">
                <div style="font-size: 11px; color: #64748B; margin-top: 6px;">Primary script or jarfile to execute (e.g. index.js, main.py, server.jar).</div>
              </div>

              <!-- Arguments -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 20px 22px;">
                <span style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">RUNTIME ARGUMENTS / FLAGS</span>
                <input type="text" id="startup-var-nodeargs" class="form-control" style="margin-top: 8px; font-family: var(--font-mono); font-size: 13px;" placeholder="e.g. --max-old-space-size=1024 or -u" oninput="triggerAutoSaveStartup()">
                <div style="font-size: 11px; color: #64748B; margin-top: 6px;">Command-line arguments and process flags passed on boot.</div>
              </div>

              <!-- Packages -->
              <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 20px 22px; grid-column: span 2;">
                <span style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">ADDITIONAL PACKAGES & DEPENDENCIES</span>
                <input type="text" id="startup-var-nodepkg" class="form-control" style="margin-top: 8px; font-family: var(--font-mono); font-size: 13px;" placeholder="e.g. express cors dotenv or requirements.txt" oninput="triggerAutoSaveStartup()">
                <div style="font-size: 11px; color: #64748B; margin-top: 6px;">Packages installed automatically during server launch pipeline.</div>
              </div>
            </div>
          </div>

          `;

html = html.slice(0, startIdx) + newStartupHtml + html.slice(startEnd);
console.log('Replaced pane-startup');

// 2. REPLACE PANE-SETTINGS (Add Auto-Save on Settings)
const setIdx = html.indexOf('<div id="pane-settings"');
const setEnd = html.indexOf('<div id="pane-activity"', setIdx);

const newSettingsHtml = `<div id="pane-settings" style="display: none;">
            <!-- Header with Auto-Save Badge -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
              <div>
                <h2 style="font-size: 22px; font-weight: 800; color: #FFF; margin: 0; letter-spacing: -0.02em;">Server Settings</h2>
                <p style="font-size: 13px; color: #94A3B8; margin-top: 4px;">Configure instance identity, allocated quotas, SFTP access, and lifecycle rules.</p>
              </div>
              <div>
                <span id="settings-autosave-indicator" style="font-size: 12px; font-weight: 700; color: #10B981; display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); padding: 5px 12px; border-radius: 20px; font-family: var(--font-mono);">
                  <i class="bi bi-check-circle-fill"></i> Auto-saved
                </span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <!-- Left Column: Identity & SFTP Details -->
              <div style="display: flex; flex-direction: column; gap: 20px;">
                <!-- Server Identity & Description (Auto-Saves on edit) -->
                <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                  <h3 style="font-size: 15px; font-weight: 700; color: #FFF; margin: 0 0 16px 0;">Server Details</h3>
                  <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div>
                      <span style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">SERVER NAME</span>
                      <input type="text" id="set-name" class="form-control" style="margin-top: 6px;" oninput="triggerAutoSaveSettings()">
                    </div>
                    <div>
                      <span style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">SERVER DESCRIPTION</span>
                      <textarea id="set-desc" class="form-control" style="margin-top: 6px; height: 75px; resize: none;" oninput="triggerAutoSaveSettings()"></textarea>
                    </div>
                  </div>
                </div>

                <!-- SFTP Details -->
                <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                  <h3 style="font-size: 15px; font-weight: 700; color: #FFF; margin: 0 0 16px 0;">SFTP Remote Access</h3>
                  <div style="margin-bottom: 12px;">
                    <span style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">SERVER ADDRESS</span>
                    <input type="text" id="settings-sftp-address" class="form-control" style="margin-top: 6px; font-family: var(--font-mono);" readonly value="sftp://127.0.0.1:2022">
                  </div>
                  <div style="margin-bottom: 14px;">
                    <span style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">USERNAME</span>
                    <input type="text" id="settings-sftp-username" class="form-control" style="margin-top: 6px; font-family: var(--font-mono);" readonly value="admin">
                  </div>
                  <div style="font-size: 11px; color: #64748B;">Your SFTP password matches your Eclipse Panel account password.</div>
                </div>
              </div>

              <!-- Right Column: Resource Quotas & Reinstall -->
              <div style="display: flex; flex-direction: column; gap: 20px;">
                <!-- Resource Quotas (Auto-Saves) -->
                <div style="background: #121422; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 22px 24px;">
                  <h3 style="font-size: 15px; font-weight: 700; color: #FFF; margin: 0 0 16px 0;">Resource Limits</h3>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                    <div>
                      <span style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">MEMORY LIMIT (MB)</span>
                      <input type="number" id="set-mem-limit" class="form-control" style="margin-top: 6px; font-family: var(--font-mono);" value="1024" oninput="triggerAutoSaveSettings()">
                    </div>
                    <div>
                      <span style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase;">CPU LIMIT (%)</span>
                      <input type="number" id="set-cpu-limit" class="form-control" style="margin-top: 6px; font-family: var(--font-mono);" value="100" oninput="triggerAutoSaveSettings()">
                    </div>
                  </div>
                  <div style="margin-top: 14px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                      <input type="checkbox" id="set-auto-restart" checked onchange="triggerAutoSaveSettings()" style="width: 16px; height: 16px; accent-color: var(--primary);">
                      <span style="font-size: 12px; color: #FFF; font-weight: 600;">Enable Crash Watchdog & Auto-Restart on unexpected exit</span>
                    </label>
                  </div>
                </div>

                <!-- Danger Zone: Reinstall Server -->
                <div style="background: #121422; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 14px; padding: 22px 24px;">
                  <h3 style="font-size: 15px; font-weight: 700; color: #EF4444; margin: 0 0 8px 0;">Reinstall Server</h3>
                  <p style="font-size: 12px; color: #94A3B8; margin: 0 0 14px 0; line-height: 1.5;">
                    Reinstalling this container resets dependencies and reruns the runtime bootstrap. Existing code will remain intact.
                  </p>
                  <button type="button" class="btn-secondary" style="background: rgba(239, 68, 68, 0.15); border-color: #EF4444; color: #EF4444; font-weight: 700; border-radius: 20px; padding: 8px 18px; font-size: 12px;" onclick="reinstallServerPrompt()">
                    Reinstall Server
                  </button>
                </div>
              </div>
            </div>
          </div>

          `;

html = html.slice(0, setIdx) + newSettingsHtml + html.slice(setEnd);
console.log('Replaced pane-settings');

// 3. REPLACE FILES-EDITOR-VIEW (Exact Nebula Editor, Bigger & Feature-Packed)
const editIdx = html.indexOf('<div id="files-editor-view"');
const editEnd = html.indexOf('<!-- TAB: DATABASES -->', editIdx);

const newEditorHtml = `<div id="files-editor-view" style="display: none;">
              <!-- Editor Top Control Bar -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 12px;">
                <!-- Breadcrumbs & Filename -->
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                  <button type="button" class="btn-secondary" onclick="closeFileEditor()" style="border-radius: 20px; padding: 7px 14px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="bi bi-arrow-left"></i> Back to Files
                  </button>
                  <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: #22D3EE;" id="editor-file-path-breadcrumb">/home/container/</span>
                  <input type="text" id="editor-filename-input" class="form-control" style="width: 220px; font-family: var(--font-mono); font-size: 13px; font-weight: 700; padding: 7px 12px; background: rgba(0,0,0,0.35);" placeholder="filename.ext">
                  <span id="editor-save-indicator" style="font-size: 11px; color: #10B981; font-family: var(--font-mono); font-weight: 700; background: rgba(16, 185, 129, 0.12); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.25);">✓ Saved</span>
                </div>

                <!-- Primary Action Buttons -->
                <div style="display: flex; align-items: center; gap: 10px;">
                  <button type="button" class="btn-secondary" onclick="closeFileEditor()" style="border-radius: 20px; padding: 8px 16px; font-size: 12px;">Cancel</button>
                  <button type="button" class="btn-primary" id="btn-save-file" onclick="saveActiveFile()" style="border-radius: 20px; padding: 8px 22px; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="bi bi-floppy-fill"></i> Save Content (Ctrl+S)
                  </button>
                </div>
              </div>

              <!-- Secondary Feature Toolbar (Rich Editor Tools) -->
              <div style="display: flex; justify-content: space-between; align-items: center; background: #10121F; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 10px 10px 0 0; padding: 8px 14px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                  <!-- Language Mode Selector -->
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 11px; color: #64748B; font-weight: 700;">MODE:</span>
                    <select id="editor-lang-select" class="form-control" style="width: 130px; font-size: 11px; padding: 4px 8px; font-weight: 700; font-family: var(--font-mono);" onchange="setEditorLanguage(this.value)">
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="python">Python</option>
                      <option value="json">JSON</option>
                      <option value="html">HTML</option>
                      <option value="css">CSS</option>
                      <option value="yaml">YAML</option>
                      <option value="markdown">Markdown</option>
                      <option value="shell">Shell / Bash</option>
                      <option value="plaintext">Plain Text</option>
                    </select>
                  </div>

                  <!-- Font Size -->
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: #64748B; font-weight: 700;">SIZE:</span>
                    <button type="button" class="quick-cmd-btn" onclick="setEditorFontSize('13px')" style="padding: 2px 7px; font-size: 11px;">13px</button>
                    <button type="button" class="quick-cmd-btn active" onclick="setEditorFontSize('15px')" style="padding: 2px 7px; font-size: 11px;">15px</button>
                    <button type="button" class="quick-cmd-btn" onclick="setEditorFontSize('17px')" style="padding: 2px 7px; font-size: 11px;">17px</button>
                  </div>

                  <!-- Word Wrap Toggle -->
                  <button type="button" id="btn-toggle-wrap" class="quick-cmd-btn" onclick="toggleEditorWrap()" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="bi bi-text-wrap"></i> Wrap: Off
                  </button>

                  <!-- Theme Selector -->
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: #64748B; font-weight: 700;">THEME:</span>
                    <select id="editor-theme-select" class="form-control" style="width: 120px; font-size: 11px; padding: 4px 8px;" onchange="setEditorTheme(this.value)">
                      <option value="dark">Nebula Dark</option>
                      <option value="cyan">Electric Cyan</option>
                      <option value="void">Midnight Void</option>
                    </select>
                  </div>
                </div>

                <!-- Quick Find (Ctrl+F) & Copy All -->
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="display: flex; align-items: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 2px 8px;">
                    <i class="bi bi-search" style="font-size: 11px; color: #64748B; margin-right: 6px;"></i>
                    <input type="text" id="editor-find-input" placeholder="Find in file..." style="background: transparent; border: none; outline: none; color: #FFF; font-size: 11px; width: 110px; font-family: var(--font-mono);" onkeydown="if(event.key==='Enter')findNextInEditor(this.value)">
                    <span id="editor-find-count" style="font-size: 10px; color: #06B6D4; margin-left: 4px; font-family: var(--font-mono);"></span>
                  </div>
                  <button type="button" class="quick-cmd-btn" onclick="copyEntireEditorContent()" title="Copy entire file to clipboard" style="padding: 4px 10px; font-size: 11px;">
                    <i class="bi bi-clipboard"></i> Copy All
                  </button>
                </div>
              </div>

              <!-- Main Large Code Area (Gutter + Textarea) -->
              <div id="editor-workspace-root" class="nebula-editor-workspace" style="min-height: 580px; height: calc(100vh - 280px); border-radius: 0 0 12px 12px; background: #080912; border: 1px solid rgba(255, 255, 255, 0.08); border-top: none; display: flex; overflow: hidden; position: relative;">
                <div id="editor-gutter" class="nebula-editor-gutter" style="background: #0B0D18; border-right: 1px solid rgba(255,255,255,0.06); padding: 16px 12px; font-family: var(--font-mono); font-size: 13.5px; color: #4A5068; text-align: right; user-select: none; min-width: 54px; overflow: hidden; line-height: 1.75;">1</div>
                <textarea id="file-editor" class="nebula-editor-textarea" style="flex: 1; background: transparent; color: #F1F5F9; font-family: 'JetBrains Mono', monospace; font-size: 15px; line-height: 1.75; padding: 16px 18px; border: none; outline: none; resize: none; tab-size: 2; white-space: pre; overflow: auto;" spellcheck="false" placeholder="// Start typing or paste your code here..."></textarea>
              </div>

              <!-- Statusbar -->
              <div class="nebula-studio-statusbar" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748B; font-family: var(--font-mono); padding: 4px 6px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span id="editor-cursor-pos">Ln 1, Col 1</span>
                  <span>|</span>
                  <span id="editor-lines-total">1 lines</span>
                  <span>|</span>
                  <span id="editor-char-count">0 characters</span>
                </div>
                <div style="display: flex; align-items: center; gap: 14px;">
                  <span>Spaces: 2</span>
                  <span>|</span>
                  <span style="color: #94A3B8;">[Ctrl+S Save]  [Ctrl+F Find]  [Esc Close]</span>
                </div>
              </div>
            </div>
          </div>

          `;

html = html.slice(0, editIdx) + newEditorHtml + html.slice(editEnd);
console.log('Replaced files-editor-view');

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch DOM part 2 applied');
