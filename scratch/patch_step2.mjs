import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. Add btn-play, btn-restart, btn-stop classes to power buttons
html = html.replace(
  '<button type="button" class="nebula-circle-btn" onclick="execAction(\'start\')" title="Start Server">',
  '<button type="button" class="nebula-circle-btn btn-play" onclick="execAction(\'start\')" title="Start Server">'
);
html = html.replace(
  '<button type="button" class="nebula-circle-btn" onclick="execAction(\'restart\')" title="Restart Server">',
  '<button type="button" class="nebula-circle-btn btn-restart" onclick="execAction(\'restart\')" title="Restart Server">'
);
html = html.replace(
  '<button type="button" class="nebula-circle-btn" onclick="execAction(\'stop\')" title="Stop Server">',
  '<button type="button" class="nebula-circle-btn btn-stop" onclick="execAction(\'stop\')" title="Stop Server">'
);

// 2. Add File Modals and Context Menu DOM before </body>
const fileModalsHtml = `
  <!-- Floating File Context Menu (Exact Nebula styling from frame_001.png) -->
  <div id="file-context-menu" class="file-context-menu" style="display: none;"></div>

  <!-- Create Directory Modal (Matches frame_008.png) -->
  <div id="modal-create-directory" class="modal-backdrop">
    <div class="modal-box" style="max-width: 440px;">
      <div class="modal-header">
        <h3 style="font-size: 17px; font-weight: 800; color: #FFF;">Create Directory</h3>
        <button type="button" class="modal-close-btn" onclick="closeModal('modal-create-directory')">✕</button>
      </div>
      <div style="padding: 20px;">
        <label style="font-size: 11px; font-weight: 700; color: #94A3B8; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Name</label>
        <input type="text" id="input-dir-name" class="form-control" placeholder="my-new-folder" style="margin-bottom: 10px; font-family: var(--font-mono); font-size: 13px;" onkeydown="if(event.key==='Enter')submitCreateDirectory()">
        <div style="font-size: 12px; color: #64748B; font-family: var(--font-mono); margin-bottom: 22px;">
          This Directory Will Be Created As <span id="create-dir-target-path" style="color: #22D3EE;">/home/container/</span>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-create-directory')" style="border-radius: 20px; padding: 8px 18px; font-size: 12px;">Cancel</button>
          <button type="button" class="btn-primary" onclick="submitCreateDirectory()" style="border-radius: 20px; padding: 8px 22px; font-size: 12px;">Create</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Move File Modal -->
  <div id="modal-move-file" class="modal-backdrop">
    <div class="modal-box" style="max-width: 440px;">
      <div class="modal-header">
        <h3 style="font-size: 17px; font-weight: 800; color: #FFF;">Move Item</h3>
        <button type="button" class="modal-close-btn" onclick="closeModal('modal-move-file')">✕</button>
      </div>
      <div style="padding: 20px;">
        <label style="font-size: 11px; font-weight: 700; color: #94A3B8; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Target Directory</label>
        <input type="text" id="input-move-dest" class="form-control" placeholder="/ or folder-name" style="margin-bottom: 10px; font-family: var(--font-mono); font-size: 13px;" onkeydown="if(event.key==='Enter')submitMoveFile()">
        <input type="hidden" id="input-move-source">
        <div style="font-size: 12px; color: #64748B; font-family: var(--font-mono); margin-bottom: 22px;">
          Item: <span id="move-source-display" style="color: #22D3EE;"></span>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-move-file')" style="border-radius: 20px; padding: 8px 18px; font-size: 12px;">Cancel</button>
          <button type="button" class="btn-primary" onclick="submitMoveFile()" style="border-radius: 20px; padding: 8px 22px; font-size: 12px;">Move</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Rename Modal -->
  <div id="modal-rename-file" class="modal-backdrop">
    <div class="modal-box" style="max-width: 440px;">
      <div class="modal-header">
        <h3 style="font-size: 17px; font-weight: 800; color: #FFF;">Rename Item</h3>
        <button type="button" class="modal-close-btn" onclick="closeModal('modal-rename-file')">✕</button>
      </div>
      <div style="padding: 20px;">
        <label style="font-size: 11px; font-weight: 700; color: #94A3B8; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">New Name</label>
        <input type="text" id="input-rename-new" class="form-control" placeholder="new-filename.ext" style="margin-bottom: 10px; font-family: var(--font-mono); font-size: 13px;" onkeydown="if(event.key==='Enter')submitRenameFile()">
        <input type="hidden" id="input-rename-old">
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-rename-file')" style="border-radius: 20px; padding: 8px 18px; font-size: 12px;">Cancel</button>
          <button type="button" class="btn-primary" onclick="submitRenameFile()" style="border-radius: 20px; padding: 8px 22px; font-size: 12px;">Rename</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Permissions Modal -->
  <div id="modal-permissions" class="modal-backdrop">
    <div class="modal-box" style="max-width: 400px;">
      <div class="modal-header">
        <h3 style="font-size: 17px; font-weight: 800; color: #FFF;">File Permissions</h3>
        <button type="button" class="modal-close-btn" onclick="closeModal('modal-permissions')">✕</button>
      </div>
      <div style="padding: 20px;">
        <label style="font-size: 11px; font-weight: 700; color: #94A3B8; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Mode (Octal)</label>
        <input type="text" id="input-perm-mode" class="form-control" value="0644" style="margin-bottom: 10px; font-family: var(--font-mono); font-size: 14px;" onkeydown="if(event.key==='Enter')submitPermissions()">
        <input type="hidden" id="input-perm-file">
        <div style="font-size: 12px; color: #64748B; font-family: var(--font-mono); margin-bottom: 22px;">
          Item: <span id="perm-file-display" style="color: #22D3EE;"></span>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-permissions')" style="border-radius: 20px; padding: 8px 18px; font-size: 12px;">Cancel</button>
          <button type="button" class="btn-primary" onclick="submitPermissions()" style="border-radius: 20px; padding: 8px 22px; font-size: 12px;">Save</button>
        </div>
      </div>
    </div>
  </div>
`;

if (!html.includes('id="modal-create-directory"')) {
  html = html.replace('</body>', fileModalsHtml + '\n</body>');
  console.log('Added file modals to app.html');
}

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch step 2 completed');
