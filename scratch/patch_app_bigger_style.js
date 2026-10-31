import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const appHtmlPath = path.join(panelDir, 'public', 'app.html');
let appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const sIdx = appHtml.indexOf('<style>');
const eIdx = appHtml.indexOf('</style>');

if (sIdx === -1 || eIdx === -1) {
  console.error('Failed to locate <style> in app.html');
  process.exit(1);
}

const biggerStyleContent = `<style>
    /* Bigger Authentic Nebula Proportions (Screenshot 212750 & demo.nebula.style) */
    .nebula-server-sidebar {
      width: 230px !important;
      min-width: 230px !important;
      max-width: 230px !important;
      padding: 20px 14px !important;
      gap: 7px !important;
    }
    .nebula-cockpit-main {
      margin-left: 230px !important;
      max-width: calc(100vw - 230px) !important;
      padding: 26px 36px !important;
    }
    .nebula-nav-item {
      padding: 13px 20px !important;
      border-radius: 14px !important;
      font-size: 14.5px !important;
      font-weight: 600 !important;
      min-height: 50px !important;
      gap: 14px !important;
    }
    .nebula-nav-item i {
      font-size: 20px !important;
    }

    /* WIDE PILL POWER BUTTONS (Matches Screenshot 212750) */
    .nebula-power-circle-group {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }
    .nebula-circle-btn {
      width: 72px !important;
      height: 44px !important;
      border-radius: 14px !important;
      background: #181628 !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      color: #E2E8F0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
    }
    .nebula-circle-btn:hover:not(:disabled) {
      transform: translateY(-2px) !important;
      border-color: rgba(168, 85, 247, 0.5) !important;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55) !important;
      color: #FFF !important;
    }
    .nebula-circle-btn.start:hover:not(:disabled) {
      background: rgba(16, 185, 129, 0.25) !important;
      border-color: #10B981 !important;
      color: #10B981 !important;
    }
    .nebula-circle-btn.restart:hover:not(:disabled) {
      background: rgba(245, 158, 11, 0.25) !important;
      border-color: #F59E0B !important;
      color: #F59E0B !important;
    }
    .nebula-circle-btn.stop:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.25) !important;
      border-color: #EF4444 !important;
      color: #EF4444 !important;
    }
    .nebula-circle-btn:disabled {
      opacity: 0.35 !important;
      cursor: not-allowed !important;
      transform: none !important;
      box-shadow: none !important;
    }

    /* Bigger Action Pill Buttons */
    .btn-primary {
      padding: 11px 24px !important;
      font-size: 14px !important;
      border-radius: 14px !important;
      font-weight: 700 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 9px !important;
    }
    .btn-secondary {
      padding: 11px 22px !important;
      font-size: 14px !important;
      border-radius: 14px !important;
      font-weight: 600 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 9px !important;
    }
    .quick-cmd-btn {
      background: rgba(255, 255, 255, 0.06) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      color: #C5C8D4 !important;
      font-family: var(--font-mono) !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 7px 15px !important;
      border-radius: 8px !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
    }
    .quick-cmd-btn:hover {
      background: rgba(168, 85, 247, 0.2) !important;
      border-color: #A855F7 !important;
      color: #FFF !important;
    }

    /* Bigger Spec Cards on Right Stack */
    .nebula-spec-stack {
      gap: 13px !important;
    }
    .nebula-spec-card {
      min-height: 68px !important;
      padding: 14px 20px !important;
      border-radius: 15px !important;
      background: #141224 !important;
      border: 1px solid rgba(255, 255, 255, 0.05) !important;
    }
    .nebula-spec-card:hover {
      border-color: rgba(168, 85, 247, 0.35) !important;
      background: #19162D !important;
    }
    .nebula-spec-card-label {
      font-size: 11.5px !important;
      font-weight: 700 !important;
      color: #8C8F9F !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      margin-bottom: 4px !important;
    }
    .nebula-spec-card-value {
      font-size: 16.5px !important;
      font-weight: 800 !important;
      color: #FFF !important;
    }
    .nebula-spec-card .card-watermark {
      font-size: 38px !important;
      right: 18px !important;
    }

    /* Bigger Terminal Dimensions & Input Prompt */
    .nebula-terminal-container {
      border-radius: 16px !important;
    }
    .nebula-terminal-header {
      padding: 12px 18px !important;
    }
    .nebula-terminal-body {
      min-height: 480px !important;
      height: calc(100vh - 380px) !important;
      font-size: 13px !important;
      line-height: 1.6 !important;
      padding: 16px 20px !important;
    }
    .nebula-terminal-input-bar {
      padding: 12px 18px !important;
      gap: 12px !important;
    }
    .nebula-terminal-prefix {
      font-size: 15px !important;
      font-weight: 700 !important;
      color: #A855F7 !important;
    }
    .nebula-terminal-input {
      font-size: 13.5px !important;
      color: #FFF !important;
    }
    .nebula-terminal-send-btn {
      font-size: 17px !important;
      padding: 4px 10px !important;
    }

    /* Bigger Bottom Gauges */
    .nebula-bottom-gauges {
      gap: 18px !important;
      margin-top: 18px !important;
    }
    .nebula-gauge-card {
      padding: 18px 22px !important;
      height: 115px !important;
      border-radius: 16px !important;
    }

    /* Bigger Announcement Banner */
    .nebula-demo-banner {
      padding: 13px 22px !important;
      border-radius: 16px !important;
      font-size: 13.5px !important;
    }

    /* Bigger Server Title Header */
    .nebula-server-title {
      font-size: 28px !important;
      font-weight: 800 !important;
    }
    .nebula-server-desc {
      font-size: 13.5px !important;
      color: #8C8F9F !important;
      margin-top: 4px !important;
    }
  </style>`;

appHtml = appHtml.slice(0, sIdx) + biggerStyleContent + appHtml.slice(eIdx + 8);
fs.writeFileSync(appHtmlPath, appHtml, 'utf8');
console.log('✓ app.html <style> updated with bigger authentic Nebula proportions');
