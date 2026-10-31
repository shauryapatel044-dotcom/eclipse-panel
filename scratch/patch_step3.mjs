import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// Replace switchConsoleTab with a bulletproof version
const oldSwitchIdx = html.indexOf('function switchConsoleTab(tab) {');
const oldSwitchEnd = html.indexOf('// Loads ONLY the opened server', oldSwitchIdx);
const oldSwitch = html.slice(oldSwitchIdx, oldSwitchEnd);

const newSwitch = `let currentActiveTab = 'console';

    function closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
    }

    function switchConsoleTab(tab) {
      currentActiveTab = tab;
      const allTabs = ['console', 'files', 'databases', 'backups', 'schedules', 'network', 'team', 'startup', 'settings', 'config', 'activity'];
      
      allTabs.forEach(t => {
        const pane = document.getElementById('pane-' + t);
        const sideBtn = document.getElementById('side-nav-' + t);
        const tabBtn = document.getElementById('tab-btn-' + t);
        
        if (pane) {
          if (t === tab) {
            pane.style.display = 'block';
            pane.classList.remove('tab-pane-fade-in');
            void pane.offsetWidth; // Trigger reflow for animation restart
            pane.classList.add('tab-pane-fade-in');
          } else {
            pane.style.display = 'none';
          }
        }
        if (sideBtn) {
          if (t === tab) sideBtn.classList.add('active');
          else sideBtn.classList.remove('active');
        }
        if (tabBtn) {
          if (t === tab) tabBtn.classList.add('active');
          else tabBtn.classList.remove('active');
        }
      });

      // Hide open context menu if any
      const ctxMenu = document.getElementById('file-context-menu');
      if (ctxMenu) ctxMenu.style.display = 'none';

      try {
        if (tab === 'files' && currentAppId) loadFiles(currentAppId, currentSubpath || '');
        else if (tab === 'startup' && currentAppId) loadStartupConfig(currentAppId);
        else if (tab === 'settings' && currentAppObj) populateSettingsTab(currentAppObj);
        else if (tab === 'databases' && currentAppId) loadDatabases();
        else if (tab === 'backups' && currentAppId) loadBackups();
        else if (tab === 'schedules' && currentAppId) loadSchedules();
        else if (tab === 'network' && currentAppId) loadWebhookInfo();
        else if (tab === 'team' && currentAppId) loadCollaborators();
        else if (tab === 'activity' && currentAppId) loadActivityLog();
      } catch (err) {
        console.error('Error loading tab data for ' + tab + ':', err);
      }
    }

    `;

html = html.replace(oldSwitch, newSwitch);
console.log('Updated switchConsoleTab');

// In loadOpenedServer, ensure admin buttons are shown & active tab reloaded
html = html.replace(
  'await switchApp(reqApp);',
  `await switchApp(reqApp);
      if (currentUser && currentUser.role === 'admin') {
        const adminBtn = document.getElementById('side-nav-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
        const designerBtn = document.getElementById('side-nav-designer');
        if (designerBtn) designerBtn.style.display = 'flex';
        const bannerLink = document.getElementById('banner-designer-link');
        if (bannerLink) bannerLink.style.display = 'inline';
      } else {
        const bannerLink = document.getElementById('banner-designer-link');
        if (bannerLink) bannerLink.style.display = 'none';
      }
      if (currentActiveTab && currentActiveTab !== 'console') {
        switchConsoleTab(currentActiveTab);
      }`
);
console.log('Updated loadOpenedServer');

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch step 3 completed');
