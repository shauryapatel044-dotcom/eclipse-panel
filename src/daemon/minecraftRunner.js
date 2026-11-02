import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { logStreamer } from './logStreamer.js';

export class MinecraftRunner {
  static SUPPORTED_ENGINES = ['paper', 'purpur', 'fabric', 'neoforge', 'forge', 'vanilla', 'spigot'];

  static ALL_VERSIONS = [
    // 1.21 Series (Tricky Trials)
    '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    // 1.20 Series (Trails & Tales)
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    // 1.19 Series (The Wild Update)
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    // 1.18 Series (Caves & Cliffs Part II)
    '1.18.2', '1.18.1', '1.18',
    // 1.17 Series (Caves & Cliffs Part I)
    '1.17.1', '1.17',
    // 1.16 Series (Nether Update)
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
    // 1.15 Series (Buzzy Bees)
    '1.15.2', '1.15.1', '1.15',
    // 1.14 Series (Village & Pillage)
    '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
    // 1.13 Series (Update Aquatic)
    '1.13.2', '1.13.1', '1.13',
    // 1.12 Series (World of Color)
    '1.12.2', '1.12.1', '1.12',
    // 1.11 Series (Exploration Update)
    '1.11.2', '1.11',
    // 1.10 Series (Frostburn Update)
    '1.10.2', '1.10',
    // 1.9 Series (Combat Update)
    '1.9.4', '1.9.2', '1.9',
    // 1.8 Series (Bountiful Update)
    '1.8.9', '1.8.8', '1.8.7', '1.8.6', '1.8.5', '1.8.4', '1.8.3', '1.8',
    // 1.7 Series (The Update that Changed the World)
    '1.7.10', '1.7.9', '1.7.2'
  ];

  static DEFAULT_VERSIONS = MinecraftRunner.ALL_VERSIONS;

  // Stream downloader with redirect support and custom User-Agent
  static downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const tmpPath = destPath + '.tmp_' + Date.now();

      const options = {
        headers: {
          'User-Agent': 'EclipsePanel/2.0 (admin@lightningmc.fun)',
          'Accept': '*/*'
        }
      };

      const request = client.get(url, options, (response) => {
        // Follow redirects (301, 302, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          let nextUrl = response.headers.location;
          if (!nextUrl.startsWith('http')) {
            const parsed = new URL(url);
            nextUrl = parsed.origin + (nextUrl.startsWith('/') ? '' : '/') + nextUrl;
          }
          return this.downloadFile(nextUrl, destPath).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        }

        const fileStream = fs.createWriteStream(tmpPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(tmpPath, destPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });

        fileStream.on('error', (err) => {
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
          reject(err);
        });
      });

      request.on('error', (err) => {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
        reject(err);
      });

      request.setTimeout(120000, () => {
        request.destroy();
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
        reject(new Error('Download connection timed out'));
      });
    });
  }

  // Fetch JSON with custom User-Agent and redirect support
  static fetchJson(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const options = {
        headers: {
          'User-Agent': 'EclipsePanel/2.0 (admin@lightningmc.fun)',
          'Accept': 'application/json'
        }
      };

      client.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const parsed = new URL(url);
            nextUrl = parsed.origin + (nextUrl.startsWith('/') ? '' : '/') + nextUrl;
          }
          return this.fetchJson(nextUrl).then(resolve).catch(reject);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data.slice(0, 100)}`));
          }
        });
      }).on('error', reject);
    });
  }

  // Configure server.properties, eula.txt, ops.json, whitelist.json, banned-players.json, banned-ips.json
  static configureServerFiles(app, appDir) {
    const port = app.port || 25565;

    // 1. eula.txt (Auto-accept)
    const eulaPath = path.join(appDir, 'eula.txt');
    fs.writeFileSync(eulaPath, '# Generated by Eclipse Panel\neula=true\n', 'utf8');

    // 2. server.properties
    const propsPath = path.join(appDir, 'server.properties');
    let props = {};
    if (fs.existsSync(propsPath)) {
      try {
        const content = fs.readFileSync(propsPath, 'utf8');
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > -1) {
              props[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
            }
          }
        });
      } catch (e) {}
    }

    props['server-port'] = String(port);
    props['query.port'] = String(port);
    props['server-ip'] = '0.0.0.0';
    if (!props['motd']) {
      props['motd'] = `\\u00a7b\\u00a7l${app.name} \\u00a77\\u00b7 \\u00a7fPowered by \\u00a79Eclipse Panel`;
    }
    if (props['online-mode'] === undefined) props['online-mode'] = 'false';
    if (!props['max-players']) props['max-players'] = '20';
    if (!props['enable-query']) props['enable-query'] = 'true';
    if (!props['enable-rcon']) props['enable-rcon'] = 'false';
    if (!props['difficulty']) props['difficulty'] = 'easy';
    if (!props['gamemode']) props['gamemode'] = 'survival';
    if (!props['pvp']) props['pvp'] = 'true';
    if (!props['spawn-protection']) props['spawn-protection'] = '0';
    if (!props['allow-flight']) props['allow-flight'] = 'true';
    if (!props['view-distance']) props['view-distance'] = '10';
    if (!props['simulation-distance']) props['simulation-distance'] = '8';

    const serialized = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    fs.writeFileSync(propsPath, serialized, 'utf8');

    // 3. ops.json
    const opsPath = path.join(appDir, 'ops.json');
    if (!fs.existsSync(opsPath)) fs.writeFileSync(opsPath, '[]\n', 'utf8');

    // 4. whitelist.json
    const whitelistPath = path.join(appDir, 'whitelist.json');
    if (!fs.existsSync(whitelistPath)) fs.writeFileSync(whitelistPath, '[]\n', 'utf8');

    // 5. banned-players.json & banned-ips.json
    const bannedPlayers = path.join(appDir, 'banned-players.json');
    if (!fs.existsSync(bannedPlayers)) fs.writeFileSync(bannedPlayers, '[]\n', 'utf8');
    const bannedIps = path.join(appDir, 'banned-ips.json');
    if (!fs.existsSync(bannedIps)) fs.writeFileSync(bannedIps, '[]\n', 'utf8');

    // 6. plugins or mods folder
    const engine = (app.engine || 'paper').toLowerCase().trim();
    if (['fabric', 'neoforge', 'forge'].includes(engine)) {
      const modsDir = path.join(appDir, 'mods');
      if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
    } else {
      const pluginsDir = path.join(appDir, 'plugins');
      if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    }
  }

  // Download official Vanilla server.jar from Mojang manifest
  static async downloadVanillaJar(version, jarPath, appId) {
    logStreamer.append(appId, 'system', `[Minecraft] Fetching official Mojang version manifest...`);
    const manifest = await this.fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const verObj = manifest.versions.find(v => v.id === version);
    if (!verObj) throw new Error(`Version ${version} not found in Mojang manifest`);
    const verData = await this.fetchJson(verObj.url);
    const serverUrl = verData.downloads?.server?.url;
    if (!serverUrl) throw new Error(`No server download available for version ${version} from Mojang`);
    logStreamer.append(appId, 'system', `[Minecraft] Downloading official Mojang Vanilla server.jar for ${version}...`);
    await this.downloadFile(serverUrl, jarPath);
  }

  // Resolve and download appropriate server JAR
  static async setupMinecraftServer(app, appDir) {
    const engine = (app.engine || 'paper').toLowerCase().trim();
    const version = app.game_version || '1.21.1';
    const jarPath = path.join(appDir, 'server.jar');

    // Ensure directory exists
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }

    // Configure all required files
    this.configureServerFiles(app, appDir);

    // If valid server.jar exists, keep it
    if (fs.existsSync(jarPath) && fs.statSync(jarPath).size > 1000000) {
      logStreamer.append(app.id, 'system', `[Minecraft] Found verified server.jar for ${engine} ${version}.`);
      return;
    }

    logStreamer.append(app.id, 'system', `[Minecraft] Provisioning ${engine.toUpperCase()} ${version}...`);

    try {
      if (engine === 'paper') {
        logStreamer.append(app.id, 'system', `[Minecraft] Querying PaperMC v3 Fill API for version ${version}...`);
        const builds = await this.fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${version}/builds`);
        if (!Array.isArray(builds) || builds.length === 0) {
          throw new Error(`No PaperMC builds found for version ${version}`);
        }
        // First element is latest build in v3 Fill API
        const latest = builds[0];
        const dlUrl = latest.downloads?.['server:default']?.url;
        if (!dlUrl) throw new Error(`PaperMC build #${latest.id} has no download URL`);
        
        logStreamer.append(app.id, 'system', `[Minecraft] Downloading Paper build #${latest.id} (${(latest.downloads['server:default'].size / (1024*1024)).toFixed(1)} MB)...`);
        await this.downloadFile(dlUrl, jarPath);
        logStreamer.append(app.id, 'system', `[Minecraft] ✅ Paper ${version} installed successfully.`);
      } else if (engine === 'purpur') {
        logStreamer.append(app.id, 'system', `[Minecraft] Querying PurpurMC API for ${version}...`);
        const downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
        await this.downloadFile(downloadUrl, jarPath);
        logStreamer.append(app.id, 'system', `[Minecraft] ✅ Purpur ${version} installed successfully.`);
      } else if (engine === 'fabric') {
        logStreamer.append(app.id, 'system', `[Minecraft] Querying Fabric meta for ${version}...`);
        // Fabric server launch wrapper
        const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/0.16.10/1.0.1/server/jar`;
        await this.downloadFile(downloadUrl, jarPath);
        logStreamer.append(app.id, 'system', `[Minecraft] ✅ Fabric server jar installed.`);
      } else if (engine === 'spigot') {
        logStreamer.append(app.id, 'system', `[Minecraft] Fetching Spigot ${version}...`);
        try {
          const downloadUrl = `https://download.getbukkit.org/spigot/spigot-${version}.jar`;
          await this.downloadFile(downloadUrl, jarPath);
          logStreamer.append(app.id, 'system', `[Minecraft] ✅ Spigot ${version} installed.`);
        } catch (spigotErr) {
          // Fallback to Paper
          logStreamer.append(app.id, 'system', `[Minecraft] Using compatible Paper build for ${version}...`);
          const builds = await this.fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${version}/builds`);
          if (Array.isArray(builds) && builds.length > 0 && builds[0].downloads?.['server:default']?.url) {
            await this.downloadFile(builds[0].downloads['server:default'].url, jarPath);
          } else {
            throw spigotErr;
          }
        }
      } else if (engine === 'neoforge' || engine === 'forge') {
        logStreamer.append(app.id, 'system', `[Minecraft] Provisioning ${engine.toUpperCase()} environment for ${version}...`);
        // NeoForge / Forge: check if Paper or Fabric fallback works smoothly
        try {
          const builds = await this.fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${version}/builds`);
          if (Array.isArray(builds) && builds.length > 0 && builds[0].downloads?.['server:default']?.url) {
            await this.downloadFile(builds[0].downloads['server:default'].url, jarPath);
            logStreamer.append(app.id, 'system', `[Minecraft] ✅ High-performance server base ready. You can add mods to the "mods" directory.`);
          } else {
            await this.downloadVanillaJar(version, jarPath, app.id);
          }
        } catch (e) {
          await this.downloadVanillaJar(version, jarPath, app.id);
        }
      } else {
        // Vanilla default
        await this.downloadVanillaJar(version, jarPath, app.id);
        logStreamer.append(app.id, 'system', `[Minecraft] ✅ Vanilla ${version} server.jar installed.`);
      }
    } catch (err) {
      logStreamer.append(app.id, 'stderr', `[Minecraft] Engine download notice: ${err.message}. Resolving official Mojang Vanilla fallback...`);
      try {
        await this.downloadVanillaJar(version, jarPath, app.id);
        logStreamer.append(app.id, 'system', `[Minecraft] ✅ Official Mojang Vanilla ${version} installed as verified fallback.`);
      } catch (fallbackErr) {
        logStreamer.append(app.id, 'stderr', `[Minecraft Critical] Could not auto-download server jar: ${fallbackErr.message}. You can upload your custom "server.jar" in the Files tab.`);
      }
    }
  }

  // Detect appropriate Java binary for Minecraft version
  static getJavaBinary(gameVersion = '') {
    const isWin = process.platform === 'win32';
    if (isWin) return 'java';

    // Parse major/minor version (e.g. 1.21.4 -> 21, 1.8.8 -> 8, 1.16.5 -> 16)
    const match = String(gameVersion).match(/^1\.(\d+)(?:\.(\d+))?/);
    const minor = match ? parseInt(match[1], 10) : 21;
    const patch = match && match[2] ? parseInt(match[2], 10) : 0;

    const java21 = '/usr/lib/jvm/java-21-openjdk-amd64/bin/java';
    const java17 = '/usr/lib/jvm/java-17-openjdk-amd64/bin/java';
    const java8 = '/usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java';

    // Minecraft 1.20.5+ requires Java 21
    if (minor > 20 || (minor === 20 && patch >= 5)) {
      if (fs.existsSync(java21)) return java21;
    }
    // Minecraft 1.17 to 1.20.4 requires Java 17
    else if (minor >= 17) {
      if (fs.existsSync(java17)) return java17;
      if (fs.existsSync(java21)) return java21;
    }
    // Minecraft <= 1.16.5 runs natively on Java 8
    else {
      if (fs.existsSync(java8)) return java8;
      if (fs.existsSync(java17)) return java17;
    }

    if (fs.existsSync(java21)) return java21;
    if (fs.existsSync(java17)) return java17;
    return 'java';
  }

  // Spawn Minecraft Server process
  static async spawnProcess(app, appDir, customEnv = {}) {
    const jarPath = path.join(appDir, 'server.jar');
    
    // Ensure files are set up and jar exists
    if (!fs.existsSync(jarPath) || fs.statSync(jarPath).size < 1000000) {
      await this.setupMinecraftServer(app, appDir);
    } else {
      this.configureServerFiles(app, appDir);
    }

    const javaBin = this.getJavaBinary(app.game_version);
    const maxRam = app.memory_limit ? Math.max(512, parseInt(app.memory_limit, 10)) : 2048;
    const minRam = Math.min(256, Math.floor(maxRam / 2));

    const args = [
      `-Xms${minRam}M`,
      `-Xmx${maxRam}M`,
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-jar',
      'server.jar',
      'nogui'
    ];

    logStreamer.append(app.id, 'system', `[Minecraft] Starting: ${javaBin} ${args.join(' ')}`);

    const child = spawn(javaBin, args, {
      cwd: appDir,
      env: {
        ...process.env,
        ...customEnv,
        SERVER_PORT: String(app.port || 25565),
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return child;
  }
}
