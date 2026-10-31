const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.html');
const html = fs.readFileSync(filePath, 'utf8');

console.log('--- Checking Scripts in public/app.html ---');
const scriptMatches = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)];
console.log('Script tags count:', scriptMatches.length);

scriptMatches.forEach((m, idx) => {
  const code = m[1];
  console.log(`\nValidating Script #${idx + 1} (${code.length} chars)...`);
  try {
    new vm.Script(code);
    console.log(`Script #${idx + 1} syntax OK!`);
  } catch (err) {
    console.error(`Script #${idx + 1} SYNTAX ERROR:`, err.message);
    const lines = code.split('\n');
    const errLine = err.stack.match(/<anonymous>:(\d+)/);
    if (errLine) {
      const lineNum = parseInt(errLine[1], 10);
      console.error(`Around line ${lineNum}:`);
      for (let l = Math.max(1, lineNum - 5); l <= Math.min(lines.length, lineNum + 5); l++) {
        console.error(`${l}: ${lines[l - 1]}`);
      }
    }
  }
});

// Check nav items and panes
const navItems = [];
const navRegex = /<(?:button|a)[^>]*nebula-nav-item[^>]*>/g;
let m;
while ((m = navRegex.exec(html)) !== null) {
  navItems.push(m[0]);
}
console.log('\nNav items found:', navItems.length);
navItems.forEach(item => console.log('NAV:', item));

const panes = [];
const paneRegex = /id=['"]pane-([^'"]+)['"]/g;
while ((m = paneRegex.exec(html)) !== null) {
  panes.push(m[1]);
}
console.log('\nPanes in DOM:', panes);
