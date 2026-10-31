import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const mainIdx = html.indexOf('<main class="nebula-cockpit-main">');
const mainClose = html.indexOf('</main>', mainIdx);
console.log('Main block length:', mainClose - mainIdx);

const mainHtml = html.slice(mainIdx, mainClose + 7);
const lines = mainHtml.split('\n');
console.log('Total lines in main:', lines.length);

// Print headers and direct children
lines.forEach((line, i) => {
  if (line.includes('id="pane-') || line.includes('class="nebula-server-header"') || line.includes('class="nebula-console-grid"') || line.includes('class="nebula-demo-banner"')) {
    console.log(`${i+1}: ${line.trim()}`);
  }
});
