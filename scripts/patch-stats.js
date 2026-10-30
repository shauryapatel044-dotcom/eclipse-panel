import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'public', 'admin-stats.html');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('/css/eclipse.css')) {
  content = content.replace('<head>', '<head>\n  <link rel="stylesheet" href="/css/eclipse.css"/>');
}

// Ensure SVG safety
if (!content.includes('svg { max-width: 100%;')) {
  content = content.replace('</style>', '  svg { max-width: 100%; max-height: 100%; }\n  </style>');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated public/admin-stats.html');
