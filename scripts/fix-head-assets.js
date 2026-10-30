import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const files = ['index.html', 'app.html', 'admin.html'];

const TAILWIND_CONFIG_BLOCK = `
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>
  <script>
    window.tailwind = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "surface": "#0A0B0E",
            "surface-dim": "#0A0B0E",
            "surface-container-lowest": "#0D0E11",
            "surface-container-low": "#12141A",
            "surface-container": "#181B22",
            "surface-container-high": "#222631",
            "surface-container-highest": "#2D3240",
            "on-surface": "#E3E2E6",
            "on-surface-variant": "#E4BEBA",
            "outline-variant": "#3D2528",
            "secondary": "#94A3B8",
            "primary": "#F87171",
            "primary-container": "#DC2626",
            "tertiary": "#10B981",
            "tertiary-container": "#059669"
          },
          fontFamily: {
            "body-lg": ["Geist", "-apple-system", "sans-serif"],
            "body-md": ["Geist", "-apple-system", "sans-serif"],
            "body-sm": ["Geist", "-apple-system", "sans-serif"],
            "headline-xl": ["Geist", "-apple-system", "sans-serif"],
            "headline-lg": ["Geist", "-apple-system", "sans-serif"],
            "headline-md": ["Geist", "-apple-system", "sans-serif"],
            "headline-sm": ["Geist", "-apple-system", "sans-serif"],
            "code-lg": ["JetBrains Mono", "monospace"],
            "code-md": ["JetBrains Mono", "monospace"],
            "code-sm": ["JetBrains Mono", "monospace"],
            "label-md": ["JetBrains Mono", "monospace"],
            "label-sm": ["JetBrains Mono", "monospace"]
          }
        }
      }
    };
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      background-color: #0A0B0E !important;
      color: #E3E2E6 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .bg-surface { background-color: #0A0B0E !important; }
    .bg-surface-container-lowest { background-color: #0D0E11 !important; }
    .bg-surface-container-low { background-color: #12141A !important; }
    .bg-surface-container { background-color: #181B22 !important; }
    .bg-surface-container-high { background-color: #222631 !important; }
    .bg-surface-container-highest { background-color: #2D3240 !important; }
    .bg-primary-container { background-color: #DC2626 !important; }
    .text-primary { color: #F87171 !important; }
    .text-on-surface { color: #E3E2E6 !important; }
    .text-secondary { color: #94A3B8 !important; }
    .text-tertiary { color: #10B981 !important; }
    .material-symbols-outlined {
      font-family: 'Material Symbols Outlined', sans-serif;
      font-weight: normal;
      font-style: normal;
      display: inline-block;
      line-height: 1;
      text-transform: none;
      letter-spacing: normal;
      word-wrap: normal;
      white-space: nowrap;
      direction: ltr;
    }
  </style>
`;

for (const file of files) {
  const filePath = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(filePath)) continue;

  let html = fs.readFileSync(filePath, 'utf8');

  // Remove the broken tailwind script placement
  html = html.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script><script id="tailwind-config">[\s\S]*?<\/script>/, TAILWIND_CONFIG_BLOCK);

  // Replace external flame logo with clean inline SVG
  html = html.replace(/<img alt="ECLIPSE PANEL Flame Logo"[^>]*src="https:\/\/lh3\.googleusercontent\.com\/[^>]*>/g, `
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-red-950 flex items-center justify-center text-white border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.4)]">
      <i class="fa-solid fa-fire text-base text-white"></i>
    </div>
  `);

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✓ Fixed CSS/Tailwind order & assets in ${file}`);
}
