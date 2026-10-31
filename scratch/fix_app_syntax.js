import fs from 'fs';
import path from 'path';
import vm from 'vm';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
let html = fs.readFileSync(appHtmlPath, 'utf8');

// Replace duplicate declaration
const target = 'let selectedFiles = new Set();\n    let activeFile = null;';
const replacement = 'let selectedFiles = new Set();\n    activeFile = null;';

if (html.includes(target)) {
  html = html.replace(target, replacement);
  fs.writeFileSync(appHtmlPath, html, 'utf8');
  console.log('✓ Duplicate activeFile declaration removed');
} else {
  console.log('Notice: target not found, checking if already fixed...');
}

// Validate all script tags in app.html
const scripts = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || [];
scripts.forEach((s, i) => {
  const code = s.replace(/<script[^>]*>|<\/script>/gi, '');
  try {
    new vm.Script(code);
    console.log(`✓ Script tag ${i}: 100% valid JavaScript syntax!`);
  } catch(err) {
    console.error(`❌ Script tag ${i} SyntaxError:`, err.message);
  }
});
