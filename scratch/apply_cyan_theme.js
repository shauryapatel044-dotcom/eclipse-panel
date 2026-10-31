import fs from 'fs';
import path from 'path';

const panelDir = 'C:\\Users\\Anand\\.gemini\\antigravity\\scratch\\eclipse-panel';
const cssPath = path.join(panelDir, 'public', 'css', 'eclipse.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. UPDATE CSS VARIABLES TO CYAN
css = css.replace(/--primary:\s*[^;]+;/g, '--primary: #06B6D4;');
css = css.replace(/--primary-hover:\s*[^;]+;/g, '--primary-hover: #22D3EE;');
css = css.replace(/--sidebarSecondarySelected:\s*[^;]+;/g, '--sidebarSecondarySelected: #06B6D4;');
css = css.replace(/--sidebarButtonActive:\s*[^;]+;/g, '--sidebarButtonActive: #06B6D4;');
css = css.replace(/--statusInstalling:\s*[^;]+;/g, '--statusInstalling: #06B6D4;');

// Replace purple gradients with Cyan gradients
css = css.replaceAll('linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)', 'linear-gradient(135deg, #0891B2 0%, #06B6D4 50%, #22D3EE 100%)');
css = css.replaceAll('linear-gradient(135deg, #8B5CF6 0%, #4F46E5 100%)', 'linear-gradient(135deg, #06B6D4 0%, #22D3EE 100%)');
css = css.replaceAll('linear-gradient(135deg, #7A98FF, #A855F7)', 'linear-gradient(135deg, #0891B2, #06B6D4, #22D3EE)');
css = css.replaceAll('linear-gradient(135deg, #7A98FF, #C084FC)', 'linear-gradient(135deg, #0891B2, #22D3EE, #00F0FF)');

// Replace purple shadows & borders with cyan
css = css.replaceAll('rgba(124, 58, 237, 0.45)', 'rgba(6, 182, 212, 0.45)');
css = css.replaceAll('rgba(124, 58, 237, 0.6)', 'rgba(6, 182, 212, 0.6)');
css = css.replaceAll('rgba(168, 85, 247, 0.45)', 'rgba(6, 182, 212, 0.45)');
css = css.replaceAll('rgba(168, 85, 247, 0.5)', 'rgba(6, 182, 212, 0.5)');
css = css.replaceAll('rgba(168, 85, 247, 0.35)', 'rgba(6, 182, 212, 0.35)');
css = css.replaceAll('rgba(168, 85, 247, 0.2)', 'rgba(6, 182, 212, 0.2)');
css = css.replaceAll('rgba(122, 152, 255, 0.3)', 'rgba(6, 182, 212, 0.3)');
css = css.replaceAll('rgba(122, 152, 255, 0.2)', 'rgba(6, 182, 212, 0.2)');
css = css.replaceAll('rgba(122, 152, 255, 0.15)', 'rgba(6, 182, 212, 0.18)');
css = css.replaceAll('rgba(122, 152, 255, 0.14)', 'rgba(6, 182, 212, 0.16)');
css = css.replaceAll('rgba(122, 152, 255, 0.12)', 'rgba(6, 182, 212, 0.14)');
css = css.replaceAll('rgba(122, 152, 255, 0.08)', 'rgba(6, 182, 212, 0.1)');

// Replace accent colors
css = css.replaceAll('#7a98ff', '#06b6d4');
css = css.replaceAll('#7A98FF', '#06B6D4');
css = css.replaceAll('#a855f7', '#22d3ee');
css = css.replaceAll('#A855F7', '#22D3EE');
css = css.replaceAll('#C084FC', '#22D3EE');

// Update active sidebar nav item to Cyan
css = css.replace(
  /\.nebula-nav-item\.active\s*\{[^}]+\}/,
  `.nebula-nav-item.active {
  background: rgba(6, 182, 212, 0.12) !important;
  border-left: 4px solid #00F0FF !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  box-shadow: 0 4px 15px rgba(6, 182, 212, 0.2) !important;
}`
);

fs.writeFileSync(cssPath, css, 'utf8');
console.log('✓ eclipse.css successfully updated to Cyan Theme!');
