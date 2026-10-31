import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';

// 1. Update src/daemon/supervisor.js to support java, bun, go, etc. in fallback
const supervisorPath = path.join(panelDir, 'src', 'daemon', 'supervisor.js');
let supCode = fs.readFileSync(supervisorPath, 'utf8');

const oldSupTarget = `    // If normalizedCmd is empty or looks like broken bash script on Windows, use clean fallback
    if (isWin && (normalizedCmd.includes('if [[') || normalizedCmd.includes('fi;'))) {
      normalizedCmd = app.type === 'nodejs' ? \`node \${mainFile}\` : \`\${pyBin} \${mainFile}\`;
    }`;

const newSupReplacement = `    // If normalizedCmd is empty or looks like broken bash script on Windows, use clean fallback
    if (isWin && (normalizedCmd.includes('if [[') || normalizedCmd.includes('fi;'))) {
      if (app.type === 'nodejs') normalizedCmd = \`node \${mainFile}\`;
      else if (app.type === 'python') normalizedCmd = \`\${pyBin} \${mainFile}\`;
      else if (app.type === 'java') normalizedCmd = \`java -jar \${mainFile}\`;
      else if (app.type === 'bun') normalizedCmd = \`bun run \${mainFile}\`;
      else if (app.type === 'go') normalizedCmd = \`go run \${mainFile}\`;
      else normalizedCmd = \`./\${mainFile}\`;
    }`;

if (supCode.includes(oldSupTarget)) {
  supCode = supCode.replace(oldSupTarget, newSupReplacement);
  fs.writeFileSync(supervisorPath, supCode, 'utf8');
  console.log('✓ supervisor.js updated with multi-runtime fallback');
} else {
  console.log('Notice: supervisor.js target snippet not matched, checking if already updated...');
}
