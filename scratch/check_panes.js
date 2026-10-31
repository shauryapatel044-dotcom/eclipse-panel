import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
const html = fs.readFileSync(appHtmlPath, 'utf8');

const panes = [
  'pane-console',
  'pane-files',
  'pane-databases',
  'pane-backups',
  'pane-schedules',
  'pane-network',
  'pane-team',
  'pane-startup',
  'pane-settings',
  'pane-activity'
];

panes.forEach(id => {
  console.log(id, html.includes(`id="${id}"`));
});
