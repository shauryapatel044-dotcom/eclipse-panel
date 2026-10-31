import fs from 'fs';

['public/app.html', 'public/index.html', 'public/admin.html', 'public/account.html', 'public/admin-stats.html'].forEach(f => {
  const html = fs.readFileSync(f, 'utf8');
  console.log('=== ' + f + ' ===');
  const regex = /<div[^>]*id=["'](modal-[^"']+)["'][^>]*>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    console.log(match[0]);
  }
});
