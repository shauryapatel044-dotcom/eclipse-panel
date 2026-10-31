import fs from 'fs';

const html = fs.readFileSync('public/app.html', 'utf8');

const funcs = ['openNewFolderPrompt', 'openNewFilePrompt', 'openFile', 'saveActiveFile', 'deleteFilePrompt', 'renameFilePrompt', 'handleFileUpload'];

funcs.forEach(f => {
  const idx = html.indexOf('function ' + f);
  if (idx !== -1) {
    console.log('Function', f, 'found');
  } else {
    console.log('MISSING:', f);
  }
});
