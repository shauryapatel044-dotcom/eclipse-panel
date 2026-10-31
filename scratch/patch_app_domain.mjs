import fs from 'fs';

let code = fs.readFileSync('src/controllers/appController.js', 'utf8');

// 1. Ensure dns is imported
if (!code.includes('import dns from \'dns\';')) {
  code = "import dns from 'dns';\n" + code;
}

// 2. Fix port assignment in createApp so port is NEVER null or undefined
const oldPortLogic = "const appPort = port ? parseInt(port, 10) : null;";
const newPortLogic = `let appPort = port ? parseInt(port, 10) : null;
      if (!appPort) {
        const appsWithPort = db.prepare('SELECT port FROM apps WHERE port IS NOT NULL').all();
        const usedPorts = new Set(appsWithPort.map(a => a.port));
        let candidate = 3000;
        while (usedPorts.has(candidate) && candidate < 9999) {
          candidate++;
        }
        appPort = candidate;
      }`;

if (code.includes(oldPortLogic)) {
  code = code.replace(oldPortLogic, newPortLogic);
  console.log('Patched createApp port allocation');
}

// 3. Add setDomain and verifyDomain methods
const domainMethods = `
  static async setDomain(req, res) {
    try {
      const { id } = req.params;
      const { domain } = req.body;
      const cleanDomain = (domain || '').trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '');
      db.prepare('UPDATE apps SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanDomain, id);
      return res.json({ success: true, domain: cleanDomain, message: 'Custom domain saved' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async verifyDomain(req, res) {
    try {
      const { id } = req.params;
      const { domain } = req.body;
      const targetDomain = (domain || '').trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '');
      if (!targetDomain) return res.status(400).json({ error: 'Domain is required' });

      let resolvedIps = [];
      let isVerified = false;

      try {
        const records = await dns.promises.resolve4(targetDomain);
        resolvedIps = records || [];
        isVerified = resolvedIps.length > 0;
      } catch (dnsErr) {
        // Fallback check: could be CNAME or localhost
        if (targetDomain === 'localhost' || targetDomain.endsWith('.local') || targetDomain.includes('127.0.0.1')) {
          isVerified = true;
          resolvedIps = ['127.0.0.1'];
        }
      }

      // Save domain if verified
      if (isVerified) {
        db.prepare('UPDATE apps SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetDomain, id);
      }

      return res.json({
        success: true,
        verified: isVerified,
        domain: targetDomain,
        resolvedIps,
        message: isVerified 
          ? \`DNS verified successfully! Domain resolves to \${resolvedIps.join(', ')}\`
          : \`Could not resolve DNS records for \${targetDomain}. Please ensure your A or CNAME record has propagated.\`
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
`;

const lastBrace = code.lastIndexOf('}');
code = code.slice(0, lastBrace) + domainMethods + '\n}\n';

fs.writeFileSync('src/controllers/appController.js', code, 'utf8');
console.log('Updated appController.js with port allocation and domain verification');
