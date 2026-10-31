import fs from 'fs';

let html = fs.readFileSync('public/app.html', 'utf8');

// 1. Check if Designer link is in sidebar
if (!html.includes('id="side-nav-designer"')) {
  const adminNavOld = `<a href="/admin.html" class="nebula-nav-item" id="side-nav-admin" title="Admin Control Center" style="display: none;">\n        <i class="bi bi-gear"></i>\n        <span>Admin</span>\n      </a>`;
  const adminNavNew = `<a href="/admin.html" class="nebula-nav-item" id="side-nav-admin" title="Admin Control Center" style="display: none;">
        <i class="bi bi-gear"></i>
        <span>Admin</span>
      </a>

      <a href="/designer.html" class="nebula-nav-item" id="side-nav-designer" title="Eclipse Designer (Cyan)" style="display: none;">
        <i class="bi bi-palette-fill" style="color: #06B6D4;"></i>
        <span>Designer</span>
      </a>`;
  html = html.replace(adminNavOld, adminNavNew);
  console.log('Added side-nav-designer');
}

// 2. Add Designer mention to top banner
html = html.replace(
  '<span>Welcome to <strong>Eclipse Panel</strong>! High-performance cloud container infrastructure. <strong style="color: #06B6D4; margin-left: 6px;">Made By Vexezor</strong></span>',
  '<span>Welcome to <strong>Eclipse Panel</strong>! Feel free to look around, and check out <a href="/designer.html" id="banner-designer-link" style="color: #22D3EE; font-weight: 700; text-decoration: underline; margin: 0 4px;">Designer ↗</a> in admin settings! <strong style="color: #06B6D4; margin-left: 6px;">Made By Vexezor</strong></span>'
);

// 3. Inject CSS Animations for Opening a server & File context menu before </style>
const animCss = `
    /* Butter-Smooth Entrance Animations for Opening a Server */
    @keyframes nebulaFadeSlideUp {
      0% {
        opacity: 0;
        transform: translateY(18px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes nebulaFadeSlideDown {
      0% {
        opacity: 0;
        transform: translateY(-16px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes nebulaFadeSlideInLeft {
      0% {
        opacity: 0;
        transform: translateX(-16px);
      }
      100% {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes nebulaButtonPopSlow {
      0% {
        opacity: 0;
        transform: scale(0.72) translateY(12px);
      }
      50% {
        opacity: 0.65;
        transform: scale(0.92) translateY(4px);
      }
      80% {
        opacity: 0.95;
        transform: scale(1.05) translateY(-2px);
      }
      100% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    @keyframes nebulaPopIn {
      0% { opacity: 0; transform: scale(0.88); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* Staggered Sidebar Items */
    .nebula-server-sidebar .nebula-nav-item:nth-child(1) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.04s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(2) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(3) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(4) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.16s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(5) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.20s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(6) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.24s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(7) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(8) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.32s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(9) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.36s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(10) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.40s both; }
    .nebula-server-sidebar .nebula-nav-item:nth-child(11) { animation: nebulaFadeSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.44s both; }

    /* Staggered Cockpit Elements */
    .nebula-demo-banner {
      animation: nebulaFadeSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both;
    }
    .nebula-server-header {
      animation: nebulaFadeSlideUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.14s both;
    }

    /* Buttons Appear Slowly & Staggered */
    .nebula-circle-btn.btn-play {
      animation: nebulaButtonPopSlow 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both !important;
    }
    .nebula-circle-btn.btn-restart {
      animation: nebulaButtonPopSlow 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.44s both !important;
    }
    .nebula-circle-btn.btn-stop {
      animation: nebulaButtonPopSlow 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.60s both !important;
    }

    /* Terminal Console */
    .nebula-terminal-container {
      animation: nebulaFadeSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.22s both;
    }

    /* Right Stats Column - Staggered */
    .nebula-server-specs-column .nebula-spec-card:nth-child(1) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.26s both; }
    .nebula-server-specs-column .nebula-spec-card:nth-child(2) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.33s both; }
    .nebula-server-specs-column .nebula-spec-card:nth-child(3) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.40s both; }
    .nebula-server-specs-column .nebula-spec-card:nth-child(4) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.47s both; }
    .nebula-server-specs-column .nebula-spec-card:nth-child(5) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.54s both; }
    .nebula-server-specs-column .nebula-spec-card:nth-child(6) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.61s both; }
    .nebula-server-specs-column .nebula-spec-card:nth-child(7) { animation: nebulaFadeSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.68s both; }

    /* Bottom 3 Gauges - Staggered */
    .nebula-bottom-gauges .nebula-gauge-card:nth-child(1) { animation: nebulaFadeSlideUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.45s both; }
    .nebula-bottom-gauges .nebula-gauge-card:nth-child(2) { animation: nebulaFadeSlideUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.55s both; }
    .nebula-bottom-gauges .nebula-gauge-card:nth-child(3) { animation: nebulaFadeSlideUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.65s both; }

    .tab-pane-fade-in {
      animation: nebulaFadeSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    /* Floating Context Menu (Exact Nebula style from frame_001.png) */
    .file-context-menu {
      position: fixed;
      z-index: 99999;
      background: #121422;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7), 0 0 1px rgba(6, 182, 212, 0.4);
      padding: 6px;
      min-width: 175px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      animation: nebulaPopIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .file-context-menu button, .file-context-menu a {
      background: transparent;
      border: none;
      color: #CBD5E1;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      font-family: inherit;
      text-align: left;
      width: 100%;
      box-sizing: border-box;
    }
    .file-context-menu button:hover, .file-context-menu a:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #FFF;
    }
    .file-context-menu button.btn-ctx-delete {
      background: rgba(239, 68, 68, 0.85);
      color: #FFF;
      border-radius: 20px;
      margin-top: 4px;
      padding: 7px 12px;
      justify-content: center;
      font-weight: 700;
    }
    .file-context-menu button.btn-ctx-delete:hover {
      background: #EF4444;
      transform: translateY(-1px);
    }

    .file-three-dots-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: transparent;
      border: 1px solid transparent;
      color: #94A3B8;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.15s;
    }
    .file-three-dots-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #FFF;
      border-color: rgba(255, 255, 255, 0.1);
    }
`;

if (!html.includes('nebulaFadeSlideUp')) {
  html = html.replace('</style>', animCss + '\n  </style>');
  console.log('Injected animation CSS');
}

fs.writeFileSync('public/app.html', html, 'utf8');
console.log('Patch step 1 completed');
