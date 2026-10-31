import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');
const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('modal-profile') || l.includes('modal-create-schedule') || l.includes('modal-add-collab') || l.includes('modal-create-directory') || l.includes('modal-move-file') || l.includes('modal-rename-file') || l.includes('modal-permissions')) {
    if (l.includes('<div')) {
      console.log((i+1) + ': ' + l.trim());
    }
  }
});
