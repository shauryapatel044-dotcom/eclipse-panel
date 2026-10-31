import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const cssPath = path.join(panelDir, 'public', 'css', 'eclipse.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Update .nebula-server-sidebar width to 230px
css = css.replace(
  /\.nebula-server-sidebar\s*\{[^}]+\}/,
  `.nebula-server-sidebar {
  width: 230px !important;
  min-width: 230px !important;
  max-width: 230px !important;
  height: 100vh !important;
  background: #090912 !important;
  border-right: 1px solid rgba(255, 255, 255, 0.05) !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 18px 12px !important;
  gap: 6px !important;
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  bottom: 0 !important;
  z-index: 100 !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
}`
);

// 2. Update .nebula-nav-item size, padding and font
css = css.replace(
  /\.nebula-nav-item\s*\{[^}]+\}/,
  `.nebula-nav-item {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px 18px;
  border-radius: 14px;
  background: #171526;
  color: #9499A8;
  font-size: 14.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid transparent;
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
}`
);

// 3. Update .nebula-nav-item i icon size
css = css.replace(
  /\.nebula-nav-item i\s*\{[^}]+\}/,
  `.nebula-nav-item i {
  font-size: 19px;
  flex-shrink: 0;
  transition: transform 0.2s ease, color 0.2s ease;
}`
);

// 4. Update .nebula-cockpit-main margin and padding
css = css.replace(
  /\.nebula-cockpit-main\s*\{[^}]+\}/,
  `.nebula-cockpit-main {
  margin-left: 230px !important;
  flex: 1;
  min-width: 0;
  max-width: calc(100vw - 230px);
  padding: 24px 32px;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  box-sizing: border-box;
}`
);

// 5. Update .nebula-circle-btn to be BIGGER WIDE PILL BUTTONS (Screenshot 212750)
css = css.replace(
  /\.nebula-power-circle-group\s*\{[^}]+\}/,
  `.nebula-power-circle-group {
  display: flex;
  align-items: center;
  gap: 12px;
}`
);

css = css.replace(
  /\.nebula-circle-btn\s*\{[^}]+\}/,
  `.nebula-circle-btn {
  width: 72px;
  height: 44px;
  border-radius: 14px;
  background: #181628;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #C5C8D4;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}`
);

// 6. Update .nebula-spec-card size and padding
css = css.replace(
  /\.nebula-spec-card\s*\{[^}]+\}/,
  `.nebula-spec-card {
  background: #141224;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 13px 18px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 64px;
}`
);

// 7. Update .nebula-console-grid columns
css = css.replace(
  /\.nebula-console-grid\s*\{[^}]+\}/,
  `.nebula-console-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}`
);

// 8. Update .nebula-spec-stack gap
css = css.replace(
  /\.nebula-spec-stack\s*\{[^}]+\}/,
  `.nebula-spec-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}`
);

// 9. Update .nebula-bottom-gauges gap and height
css = css.replace(
  /\.nebula-bottom-gauges\s*\{[^}]+\}/,
  `.nebula-bottom-gauges {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 18px;
}`
);

css = css.replace(
  /\.nebula-gauge-card\s*\{[^}]+\}/,
  `.nebula-gauge-card {
  background: #141224;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 110px;
  box-sizing: border-box;
  transition: all 0.2s ease;
}`
);

// 10. Update buttons (.btn-primary, .btn-secondary, .quick-cmd-btn)
css = css.replace(
  /\.btn-primary\s*\{[^}]+\}/,
  `.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  background: linear-gradient(135deg, #7C3AED 0%, #6366F1 100%);
  border: 1px solid rgba(168, 85, 247, 0.45);
  color: #FFFFFF;
  padding: 11px 24px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 20px -2px rgba(124, 58, 237, 0.45);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  text-decoration: none;
  font-family: inherit;
}`
);

css = css.replace(
  /\.btn-secondary\s*\{[^}]+\}/,
  `.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-main);
  padding: 11px 22px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  font-family: inherit;
}`
);

css = css.replace(
  /\.quick-cmd-btn\s*\{[^}]+\}/,
  `.quick-cmd-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}`
);

fs.writeFileSync(cssPath, css, 'utf8');
console.log('✓ eclipse.css successfully updated with bigger Nebula proportions!');
