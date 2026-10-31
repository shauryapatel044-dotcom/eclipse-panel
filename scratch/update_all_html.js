import fs from 'fs';
import path from 'path';

const publicDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel\\public';

// 1. UPDATE APP.HTML
const appPath = path.join(publicDir, 'app.html');
let appHtml = fs.readFileSync(appPath, 'utf8');

// Title
appHtml = appHtml.replace(/<title>.*?<\/title>/, '<title>Eclipse Panel - Server Cockpit · Made by Vexezor</title>');

// Banner text
appHtml = appHtml.replace(
  /Welcome to the <strong>Nebula demo<\/strong>![^<]*<strong[^>]*>Made By Vexezor<\/strong>/g,
  'Welcome to <strong>Eclipse Panel</strong>! High-performance cloud container infrastructure. <strong style="color: #06B6D4; margin-left: 6px;">Made By Vexezor</strong>'
);

// Console title
appHtml = appHtml.replace(/container@pterodactyl~/g, 'container@eclipse-panel~');

// Subtitle
appHtml = appHtml.replace(/Nothing can make Java fast, only less slow\./g, 'High-performance container environment & process supervisor.');

// Watermark / Footer
appHtml = appHtml.replace(
  /Pterodactyl®[^\n]*Nebula theme by Emma[^\n]*/g,
  'Eclipse Panel © 2026 • High-Performance Cloud Infrastructure • Made by Vexezor'
);

appHtml = appHtml.replace(
  /<div class="nebula-watermark"[\s\S]*?<\/div>/g,
  '<div class="eclipse-watermark" style="text-align: center; font-size: 11.5px; color: #64748B; font-family: var(--font-mono); margin-top: 30px; padding: 10px;">Eclipse Panel © 2026 &middot; Cloud Container Infrastructure &middot; <strong style="color: #06B6D4;">Made By Vexezor</strong></div>'
);

// Replace any remaining purple hexes in inline styles
appHtml = appHtml.replaceAll('#A855F7', '#22D3EE');
appHtml = appHtml.replaceAll('#a855f7', '#22d3ee');
appHtml = appHtml.replaceAll('#C084FC', '#22D3EE');
appHtml = appHtml.replaceAll('#7A98FF', '#06B6D4');
appHtml = appHtml.replaceAll('#7a98ff', '#06b6d4');
appHtml = appHtml.replaceAll('#6366F1', '#0891B2');
appHtml = appHtml.replaceAll('#7C3AED', '#0891B2');
appHtml = appHtml.replaceAll('rgba(168, 85, 247', 'rgba(6, 182, 212');
appHtml = appHtml.replaceAll('rgba(122, 152, 255', 'rgba(6, 182, 212');

// Fix duplicate activeFile if present
appHtml = appHtml.replace('let selectedFiles = new Set();\n    let activeFile = null;', 'let selectedFiles = new Set();\n    activeFile = null;');

fs.writeFileSync(appPath, appHtml, 'utf8');
console.log('✓ app.html updated');

// 2. UPDATE ACCOUNT.HTML
const accPath = path.join(publicDir, 'account.html');
let accHtml = fs.readFileSync(accPath, 'utf8');

accHtml = accHtml.replace(/<title>.*?<\/title>/, '<title>Eclipse Panel - Account Settings · Made by Vexezor</title>');
accHtml = accHtml.replace(
  /Welcome to <strong>Nebula Panel<\/strong>![^<]*<strong[^>]*>Made By Vexezor<\/strong>/g,
  'Welcome to <strong>Eclipse Panel</strong>! Manage your account profile, credentials, and authentication security. <strong style="color: #06B6D4; margin-left: 6px;">Made By Vexezor</strong>'
);
accHtml = accHtml.replace(
  /<div class="nebula-watermark"[\s\S]*?<\/div>/g,
  '<div class="eclipse-watermark" style="text-align: center; font-size: 11.5px; color: #64748B; font-family: var(--font-mono); margin-top: 30px; padding: 10px;">Eclipse Panel © 2026 &middot; Cloud Container Infrastructure &middot; <strong style="color: #06B6D4;">Made By Vexezor</strong></div>'
);

accHtml = accHtml.replaceAll('#A855F7', '#22D3EE');
accHtml = accHtml.replaceAll('#a855f7', '#22d3ee');
accHtml = accHtml.replaceAll('#C084FC', '#22D3EE');
accHtml = accHtml.replaceAll('#7A98FF', '#06B6D4');
accHtml = accHtml.replaceAll('#7a98ff', '#06b6d4');
accHtml = accHtml.replaceAll('#6366F1', '#0891B2');
accHtml = accHtml.replaceAll('#7C3AED', '#0891B2');
accHtml = accHtml.replaceAll('rgba(168, 85, 247', 'rgba(6, 182, 212');
accHtml = accHtml.replaceAll('rgba(122, 152, 255', 'rgba(6, 182, 212');

fs.writeFileSync(accPath, accHtml, 'utf8');
console.log('✓ account.html updated');

// 3. UPDATE INDEX.HTML
const idxPath = path.join(publicDir, 'index.html');
let idxHtml = fs.readFileSync(idxPath, 'utf8');

idxHtml = idxHtml.replace(/<title>.*?<\/title>/, '<title>Eclipse Panel · Made by Vexezor</title>');
idxHtml = idxHtml.replace(/Eclipse Panel - Nebula Edition/g, 'Eclipse Panel');
idxHtml = idxHtml.replace(/Eclipse Panel - Nebula Matrix/g, 'Eclipse Panel');
idxHtml = idxHtml.replace(
  /Welcome to the <strong>Nebula demo<\/strong>![^<]*<strong[^>]*>Made By Vexezor<\/strong>/g,
  'Welcome to <strong>Eclipse Panel</strong>! High-performance cloud container infrastructure. <strong style="color: #06B6D4; margin-left: 6px;">Made By Vexezor</strong>'
);
idxHtml = idxHtml.replace(
  /Pterodactyl®[^\n]*Nebula theme by Emma[^\n]*/g,
  'Eclipse Panel © 2026 • High-Performance Cloud Infrastructure • Made by Vexezor'
);
idxHtml = idxHtml.replace(
  /<div class="nebula-watermark"[\s\S]*?<\/div>/g,
  '<div class="eclipse-watermark" style="text-align: center; font-size: 11.5px; color: #64748B; font-family: var(--font-mono); margin-top: 30px; padding: 10px;">Eclipse Panel © 2026 &middot; Cloud Container Infrastructure &middot; <strong style="color: #06B6D4;">Made By Vexezor</strong></div>'
);

idxHtml = idxHtml.replaceAll('#A855F7', '#22D3EE');
idxHtml = idxHtml.replaceAll('#a855f7', '#22d3ee');
idxHtml = idxHtml.replaceAll('#C084FC', '#22D3EE');
idxHtml = idxHtml.replaceAll('#7A98FF', '#06B6D4');
idxHtml = idxHtml.replaceAll('#7a98ff', '#06b6d4');
idxHtml = idxHtml.replaceAll('#6366F1', '#0891B2');
idxHtml = idxHtml.replaceAll('#7C3AED', '#0891B2');
idxHtml = idxHtml.replaceAll('rgba(168, 85, 247', 'rgba(6, 182, 212');
idxHtml = idxHtml.replaceAll('rgba(122, 152, 255', 'rgba(6, 182, 212');

fs.writeFileSync(idxPath, idxHtml, 'utf8');
console.log('✓ index.html updated');

// 4. UPDATE ADMIN-STATS.HTML
const statsPath = path.join(publicDir, 'admin-stats.html');
let statsHtml = fs.readFileSync(statsPath, 'utf8');

statsHtml = statsHtml.replace(/<title>.*?<\/title>/, '<title>Eclipse Panel - Telemetry Cockpit · Made by Vexezor</title>');
statsHtml = statsHtml.replace(/Eclipse Panel - Nebula Matrix/g, 'Eclipse Panel');
statsHtml = statsHtml.replace(/Real-time CPU \(Nebula Indigo\) vs RAM \(Emerald\) % utilization over time/g, 'Real-time CPU (Cyan) vs RAM (Emerald) % utilization over time');
statsHtml = statsHtml.replace(
  /<div class="nebula-watermark"[\s\S]*?<\/div>/g,
  '<div class="eclipse-watermark" style="text-align: center; font-size: 11.5px; color: #64748B; font-family: var(--font-mono); margin-top: 30px; padding: 10px;">Eclipse Panel © 2026 &middot; Telemetry Infrastructure &middot; <strong style="color: #06B6D4;">Made By Vexezor</strong></div>'
);

statsHtml = statsHtml.replaceAll('#A855F7', '#22D3EE');
statsHtml = statsHtml.replaceAll('#a855f7', '#22d3ee');
statsHtml = statsHtml.replaceAll('#C084FC', '#22D3EE');
statsHtml = statsHtml.replaceAll('#7A98FF', '#06B6D4');
statsHtml = statsHtml.replaceAll('#7a98ff', '#06b6d4');
statsHtml = statsHtml.replaceAll('#6366F1', '#0891B2');
statsHtml = statsHtml.replaceAll('#7C3AED', '#0891B2');
statsHtml = statsHtml.replaceAll('rgba(168, 85, 247', 'rgba(6, 182, 212');
statsHtml = statsHtml.replaceAll('rgba(122, 152, 255', 'rgba(6, 182, 212');

fs.writeFileSync(statsPath, statsHtml, 'utf8');
console.log('✓ admin-stats.html updated');

// 5. UPDATE ADMIN.HTML
const adminPath = path.join(publicDir, 'admin.html');
let adminHtml = fs.readFileSync(adminPath, 'utf8');

adminHtml = adminHtml.replace(/<title>.*?<\/title>/, '<title>Eclipse Panel - Administration · Made by Vexezor</title>');
adminHtml = adminHtml.replace(/Eclipse Panel - Nebula Matrix/g, 'Eclipse Panel');
adminHtml = adminHtml.replace(/NEBULA DEPLOY STUDIO/g, 'ECLIPSE DEPLOY STUDIO');
adminHtml = adminHtml.replace(
  /<div class="nebula-watermark"[\s\S]*?<\/div>/g,
  '<div class="eclipse-watermark" style="text-align: center; font-size: 11.5px; color: #64748B; font-family: var(--font-mono); margin-top: 30px; padding: 10px;">Eclipse Panel © 2026 &middot; Administration Infrastructure &middot; <strong style="color: #06B6D4;">Made By Vexezor</strong></div>'
);

adminHtml = adminHtml.replaceAll('#A855F7', '#22D3EE');
adminHtml = adminHtml.replaceAll('#a855f7', '#22d3ee');
adminHtml = adminHtml.replaceAll('#C084FC', '#22D3EE');
adminHtml = adminHtml.replaceAll('#7A98FF', '#06B6D4');
adminHtml = adminHtml.replaceAll('#7a98ff', '#06b6d4');
adminHtml = adminHtml.replaceAll('#6366F1', '#0891B2');
adminHtml = adminHtml.replaceAll('#7C3AED', '#0891B2');
adminHtml = adminHtml.replaceAll('rgba(168, 85, 247', 'rgba(6, 182, 212');
adminHtml = adminHtml.replaceAll('rgba(122, 152, 255', 'rgba(6, 182, 212');

fs.writeFileSync(adminPath, adminHtml, 'utf8');
console.log('✓ admin.html updated');

// 6. UPDATE LOGIN.HTML
const loginPath = path.join(publicDir, 'login.html');
let loginHtml = fs.readFileSync(loginPath, 'utf8');

loginHtml = loginHtml.replace(/<title>.*?<\/title>/, '<title>Eclipse Panel - Login · Made by Vexezor</title>');
loginHtml = loginHtml.replace(
  /<div class="nebula-watermark"[\s\S]*?<\/div>/g,
  '<div class="eclipse-watermark" style="text-align: center; font-size: 11.5px; color: #64748B; font-family: var(--font-mono); margin-top: 30px; padding: 10px;">Eclipse Panel © 2026 &middot; Cloud Container Infrastructure &middot; <strong style="color: #06B6D4;">Made By Vexezor</strong></div>'
);

loginHtml = loginHtml.replaceAll('#A855F7', '#22D3EE');
loginHtml = loginHtml.replaceAll('#a855f7', '#22d3ee');
loginHtml = loginHtml.replaceAll('#C084FC', '#22D3EE');
loginHtml = loginHtml.replaceAll('#7A98FF', '#06B6D4');
loginHtml = loginHtml.replaceAll('#7a98ff', '#06b6d4');
loginHtml = loginHtml.replaceAll('#6366F1', '#0891B2');
loginHtml = loginHtml.replaceAll('#7C3AED', '#0891B2');
loginHtml = loginHtml.replaceAll('rgba(168, 85, 247', 'rgba(6, 182, 212');
loginHtml = loginHtml.replaceAll('rgba(122, 152, 255', 'rgba(6, 182, 212');

fs.writeFileSync(loginPath, loginHtml, 'utf8');
console.log('✓ login.html updated');
