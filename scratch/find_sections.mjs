import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');

const sections = ['pane-network', 'pane-team', 'pane-startup', 'pane-settings', 'files-editor-view'];

sections.forEach(s => {
  const idx = html.indexOf('id="' + s + '"');
  console.log(s, 'found at index:', idx);
});
