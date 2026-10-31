import fs from 'fs';

let code = fs.readFileSync('src/controllers/fileController.js', 'utf8');

// Update createFile parameter check
code = code.replace(
  'const { path: filePath } = req.body;\n      if (!filePath) return res.status(400).json({ error: \'Parameter "path" is required\' });',
  'const filePath = req.body.path || req.body.filePath;\n      if (!filePath) return res.status(400).json({ error: \'Parameter "path" or "filePath" is required\' });'
);

// Update duplicateFile parameter check
code = code.replace(
  'const { filePath } = req.body;\n      if (!filePath) return res.status(400).json({ error: \'"filePath" is required\' });',
  'const filePath = req.body.filePath || req.body.path;\n      if (!filePath) return res.status(400).json({ error: \'Parameter "filePath" or "path" is required\' });'
);

// Update moveFile parameter check
code = code.replace(
  'const { sourcePath, destinationDir } = req.body;\n      if (!sourcePath || destinationDir === undefined) return res.status(400).json({ error: \'"sourcePath" and "destinationDir" are required\' });',
  'const sourcePath = req.body.sourcePath || req.body.source || req.body.path;\n      const destinationDir = req.body.destinationDir !== undefined ? req.body.destinationDir : (req.body.destination !== undefined ? req.body.destination : \'\');\n      if (!sourcePath) return res.status(400).json({ error: \'"sourcePath" is required\' });'
);

fs.writeFileSync('src/controllers/fileController.js', code, 'utf8');
console.log('Updated fileController with flexible parameter handling');
