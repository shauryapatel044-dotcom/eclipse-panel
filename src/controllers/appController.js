import dns from 'dns';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { db, recordAuditLog } from '../database/index.js';
import { config } from '../config.js';
import { supervisor } from '../daemon/supervisor.js';
import { logStreamer } from '../daemon/logStreamer.js';
import { getHostIp } from '../daemon/metrics.js';
import { checkAppAccess } from '../utils/permissions.js';
import { MinecraftRunner } from '../daemon/minecraftRunner.js';
import { DatabaseRunner } from '../daemon/databaseRunner.js';

export class AppController {
  static async getApps(req, res) {
    try {
      let apps = [];
      if (req.user.role === 'admin') {
        const stmt = db.prepare(`
          SELECT a.*, u.username as owner_username, u.email as owner_email
          FROM apps a
          JOIN users u ON a.user_id = u.id
          ORDER BY a.created_at DESC
        `);
        apps = stmt.all();
      } else {
        const stmt = db.prepare(`
          SELECT DISTINCT a.*, u.username as owner_username, u.email as owner_email,
                 CASE WHEN a.user_id = ? THEN 1 ELSE 0 END as is_owner,
                 c.permissions as collaborator_permissions
          FROM apps a
          JOIN users u ON a.user_id = u.id
          LEFT JOIN app_collaborators c ON a.id = c.app_id AND c.user_id = ?
          WHERE a.user_id = ? OR c.user_id = ?
          ORDER BY a.created_at DESC
        `);
        apps = stmt.all(req.user.id, req.user.id, req.user.id, req.user.id);
      }

      // Augment each app with live runtime metrics
      const baseDomain = config.baseDomain || process.env.BASE_DOMAIN || '';
      const enriched = apps.map((app) => {
        const isRunning = supervisor.isRunning(app.id);
        const metrics = supervisor.getMetrics(app.id);
        let parsedEnv = {};
        try {
          parsedEnv = JSON.parse(app.env_vars || '{}');
        } catch (e) {}

        let domain = app.domain;
        if ((!domain || domain.trim() === '') && baseDomain) {
          const slug = app.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || app.id;
          domain = `${slug}.${baseDomain}`;
          try {
            db.prepare('UPDATE apps SET domain = ? WHERE id = ?').run(domain, app.id);
          } catch (e) {}
        }

        return {
          ...app,
          domain,
          status: isRunning ? 'running' : (app.status === 'running' ? 'stopped' : app.status),
          metrics,
          env_vars: parsedEnv,
        };
      });

      return res.json({ apps: enriched });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getAppById(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare(`
        SELECT a.*, u.username as owner_username
        FROM apps a
        JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
      `);
      const app = stmt.get(id);

      if (!app) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const baseDomain = config.baseDomain || process.env.BASE_DOMAIN || '';
      if ((!app.domain || app.domain.trim() === '') && baseDomain) {
        const slug = app.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || app.id;
        app.domain = `${slug}.${baseDomain}`;
        try {
          db.prepare('UPDATE apps SET domain = ? WHERE id = ?').run(app.domain, app.id);
        } catch (e) {}
      }

      // Check ownership or collaborator access
      if (!checkAppAccess(id, req.user)) {
        return res.status(403).json({ error: 'Forbidden: Access denied to this application' });
      }

      const isRunning = supervisor.isRunning(app.id);
      const metrics = supervisor.getMetrics(app.id);
      const logs = logStreamer.getLogs(app.id, 100);

      let parsedEnv = {};
      try {
        parsedEnv = JSON.parse(app.env_vars || '{}');
      } catch (e) {}

      const effectiveIp = (app.primary_ip && app.primary_ip !== '0.0.0.0' && app.primary_ip !== '127.0.0.1') ? app.primary_ip : getHostIp();
      return res.json({
        app: {
          ...app,
          primary_ip: effectiveIp,
          status: isRunning ? 'running' : app.status,
          metrics,
          logs,
          env_vars: parsedEnv,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async createApp(req, res) {
    try {
      const { 
        name, 
        type, 
        entrypoint, 
        port, 
        env_vars, 
        auto_restart, 
        memory_limit, 
        cpu_limit,
        disk_limit,
        primary_ip,
        domain,
        runtime_version,
        startup_cmd,
        main_file,
        node_packages,
        node_args,
        requirements_file,
        server_category,
        engine,
        game_version,
        db_password,
        db_name
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'App name is required' });
      }

      // Determine category and runtime type
      let category = (server_category || '').toLowerCase().trim();
      let normalizedType = (type || '').toLowerCase().trim();

      if (category === 'minecraft' || normalizedType === 'minecraft') {
        category = 'minecraft';
        normalizedType = 'minecraft';
      } else if (category === 'database' || normalizedType === 'database') {
        category = 'database';
        normalizedType = 'database';
      } else {
        category = 'software';
        if (!['nodejs', 'python'].includes(normalizedType)) {
          normalizedType = 'nodejs';
        }
      }

      const appId = `app_${crypto.randomBytes(4).toString('hex')}`;
      const envJson = typeof env_vars === 'object' ? JSON.stringify(env_vars) : (env_vars || '{}');
      const autoRestartVal = auto_restart === false || auto_restart === 0 ? 0 : 1;
      
      // Defaults based on category
      let finalEngine = '';
      let finalGameVersion = '';
      let finalDbPass = '';
      let finalDbName = '';
      let defaultEntry = '';

      if (category === 'minecraft') {
        const validEngines = ['paper', 'fabric', 'neoforge', 'forge', 'purpur', 'vanilla'];
        finalEngine = validEngines.includes((engine || '').toLowerCase()) ? engine.toLowerCase() : 'paper';
        finalGameVersion = game_version || '1.21.1';
        defaultEntry = 'server.jar';
      } else if (category === 'database') {
        const validEngines = ['redis', 'postgres', 'mariadb', 'mongodb'];
        finalEngine = validEngines.includes((engine || '').toLowerCase()) ? engine.toLowerCase() : 'redis';
        finalDbPass = db_password || 'ec_' + crypto.randomBytes(6).toString('hex');
        finalDbName = db_name || (name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') || 'app_db');
        defaultEntry = finalEngine;
      } else {
        defaultEntry = main_file || entrypoint || (normalizedType === 'nodejs' ? 'index.js' : 'main.py');
      }

      // Port allocation
      let appPort = port ? parseInt(port, 10) : null;
      if (!appPort) {
        const appsWithPort = db.prepare('SELECT port FROM apps WHERE port IS NOT NULL').all();
        const usedPorts = new Set(appsWithPort.map(a => a.port));
        let candidate = 3000;
        if (category === 'minecraft') {
          candidate = 25565;
        } else if (category === 'database') {
          if (finalEngine === 'redis') candidate = 6379;
          else if (finalEngine === 'postgres') candidate = 5432;
          else if (finalEngine === 'mariadb' || finalEngine === 'mysql') candidate = 3306;
          else candidate = 27017;
        }
        while (usedPorts.has(candidate) && candidate < 65000) {
          candidate++;
        }
        appPort = candidate;
      }

      const memLimit = memory_limit ? parseInt(memory_limit, 10) : (category === 'minecraft' ? 2048 : (category === 'database' ? 512 : 1024));
      const cpLimit = cpu_limit ? parseInt(cpu_limit, 10) : 100;
      const diskLimit = disk_limit ? parseInt(disk_limit, 10) : (category === 'minecraft' ? 10240 : 5120);
      const serverIp = (primary_ip && primary_ip.trim() !== '0.0.0.0' && primary_ip.trim() !== '127.0.0.1') ? primary_ip.trim() : getHostIp();
      const baseDomain = process.env.BASE_DOMAIN || '';
      const serverDomain = domain ? domain.trim() : (baseDomain ? `${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}.${baseDomain}` : '');
      const rVersion = runtime_version ? runtime_version.trim() : (category === 'minecraft' ? finalGameVersion : (normalizedType === 'nodejs' ? '20' : '3.11'));

      const defaultNodeStartup = `if [[ -d .git ]] && [[ 0 == "1" ]]; then git pull; fi; if [[ ! -z "\${NODE_PACKAGES}" ]]; then /usr/local/bin/npm install \${NODE_PACKAGES}; fi; if [[ ! -z "\${UNNODE_PACKAGES}" ]]; then /usr/local/bin/npm uninstall \${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; if [[ "\${MAIN_FILE##*.}" == "js" ]]; then /usr/local/bin/node "/home/container/\${MAIN_FILE}" \${NODE_ARGS}; else /usr/local/bin/ts-node --esm "/home/container/\${MAIN_FILE}" \${NODE_ARGS}; fi`;
      const defaultPythonStartup = `if [[ -d .git ]] && [[ "0" == "1" ]]; then git pull; fi; if [[ ! -z "" ]]; then pip install -U --prefix .local ; fi; if [[ -f /home/container/\${REQUIREMENTS_FILE} ]]; then pip install -U --prefix .local -r \${REQUIREMENTS_FILE}; fi; /usr/local/bin/python /home/container/main.py`;

      let startCmd = startup_cmd;
      if (!startCmd) {
        if (category === 'minecraft') {
          startCmd = `java -Xms512M -Xmx\${SERVER_MEMORY}M -jar server.jar nogui`;
        } else if (category === 'database') {
          startCmd = `${finalEngine}-server`;
        } else {
          startCmd = (normalizedType === 'nodejs' ? defaultNodeStartup : defaultPythonStartup);
        }
      }

      const reqFile = requirements_file || 'requirements.txt';
      const nPackages = node_packages || '';
      const nArgs = node_args || '';
      const safeFolder = supervisor.sanitizeFolderName(name.trim(), appId);

      // Insert into database with initial status 'stopped'
      const insertStmt = db.prepare(`
        INSERT INTO apps (
          id, name, type, user_id, entrypoint, port, env_vars, auto_restart, 
          memory_limit, cpu_limit, disk_limit, primary_ip, domain, runtime_version, 
          startup_cmd, main_file, node_packages, node_args, requirements_file, status, folder_name,
          server_category, engine, game_version, db_password, db_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        appId, name.trim(), normalizedType, req.user.id, defaultEntry, appPort, envJson, autoRestartVal,
        memLimit, cpLimit, diskLimit, serverIp, serverDomain, rVersion,
        startCmd, defaultEntry, nPackages, nArgs, reqFile, safeFolder,
        category, finalEngine, finalGameVersion, finalDbPass, finalDbName
      );

      // Create clean, empty app directory using server name
      const appDir = supervisor.getAppDir({ id: appId, name: name.trim(), folder_name: safeFolder });

      if (category === 'minecraft') {
        logStreamer.append(appId, 'system', `[Minecraft Server] Provisioning server container "${safeFolder}" on port ${appPort}...`);
        logStreamer.append(appId, 'system', `[Minecraft Server] Selected Engine: ${finalEngine.toUpperCase()} (MC ${finalGameVersion})`);
        await MinecraftRunner.setupMinecraftServer({ id: appId, name: name.trim(), port: appPort, engine: finalEngine, game_version: finalGameVersion }, appDir);
        logStreamer.append(appId, 'system', `[Minecraft Server] ✅ Default files auto-provisioned: server.jar, eula.txt, server.properties, ops.json, whitelist.json.`);
      } else if (category === 'database') {
        DatabaseRunner.setupDatabase({ id: appId, name: name.trim(), port: appPort, engine: finalEngine, db_password: finalDbPass, db_name: finalDbName, memory_limit: memLimit }, appDir);
        logStreamer.append(appId, 'system', `[Database Server] Provisioned ${finalEngine.toUpperCase()} on port ${appPort}. Connection configuration written.`);
      } else {
        logStreamer.append(appId, 'system', `[Eclipse Daemon] Container directory initialized at "${safeFolder}". Ready for code files.`);
      }

      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'SERVER_CREATE',
        details: `Created ${category} server "${name.trim()}" (Port: ${appPort}, RAM: ${memLimit}MB, CPU: ${cpLimit}%)`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId
      });

      return res.status(201).json({
        message: 'Application created successfully',
        appId,
        app: {
          id: appId,
          name: name.trim(),
          type: normalizedType,
          server_category: category,
          engine: finalEngine,
          game_version: finalGameVersion,
          port: appPort,
          status: 'stopped',
          memory_limit: memLimit,
          cpu_limit: cpLimit,
          disk_limit: diskLimit,
          primary_ip: serverIp,
          domain: serverDomain,
          entrypoint: defaultEntry
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateApp(req, res) {
    try {
      const { id } = req.params;
      const { 
        name, 
        entrypoint, 
        port, 
        env_vars, 
        auto_restart, 
        memory_limit, 
        cpu_limit, 
        disk_limit,
        primary_ip,
        domain,
        type,
        runtime_version,
        startup_cmd,
        main_file,
        node_packages,
        unnode_packages,
        node_args,
        requirements_file,
        engine,
        game_version,
        db_password,
        db_name
      } = req.body;

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'power') && !checkAppAccess(id, req.user, 'console')) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions to perform server actions' });
      }

      // Role check: Regular users cannot modify hardware specs (RAM, CPU, Disk, Port, IP)
      if (req.user.role !== 'admin') {
        if (
          (memory_limit !== undefined && parseInt(memory_limit, 10) !== app.memory_limit) ||
          (cpu_limit !== undefined && parseInt(cpu_limit, 10) !== app.cpu_limit) ||
          (disk_limit !== undefined && parseInt(disk_limit, 10) !== app.disk_limit) ||
          (port !== undefined && parseInt(port, 10) !== app.port) ||
          (primary_ip !== undefined && primary_ip.trim() !== app.primary_ip)
        ) {
          return res.status(403).json({ error: 'Permission denied: Hardware specifications can only be modified by an Administrator.' });
        }
      }

      // Strict category isolation guard
      const currentCategory = app.server_category || (['minecraft', 'database'].includes(app.type) ? app.type : 'software');
      let newType = app.type;
      if (type && type.trim().toLowerCase() !== app.type) {
        const reqType = type.trim().toLowerCase();
        if (currentCategory === 'minecraft' && reqType !== 'minecraft') {
          return res.status(400).json({ error: 'This is a Minecraft server and cannot be converted to software or database.' });
        }
        if (currentCategory === 'database' && reqType !== 'database') {
          return res.status(400).json({ error: 'This is a Database server and cannot be converted to software or Minecraft.' });
        }
        if (currentCategory === 'software') {
          if (!['nodejs', 'python'].includes(reqType)) {
            return res.status(400).json({ error: 'Software servers can only run Node.js or Python applications.' });
          }
          newType = reqType;
        }
      }

      const newName = name !== undefined ? name.trim() : app.name;
      const newEntrypoint = entrypoint !== undefined ? entrypoint.trim() : app.entrypoint;
      const newPort = port !== undefined ? (port ? parseInt(port, 10) : null) : app.port;
      const newAutoRestart = auto_restart !== undefined ? (auto_restart ? 1 : 0) : app.auto_restart;
      const newMem = memory_limit !== undefined ? (memory_limit ? parseInt(memory_limit, 10) : 1024) : (app.memory_limit || 1024);
      const newCpu = cpu_limit !== undefined ? (cpu_limit ? parseInt(cpu_limit, 10) : 100) : (app.cpu_limit || 100);
      const newDisk = disk_limit !== undefined ? (disk_limit ? parseInt(disk_limit, 10) : 5120) : (app.disk_limit || 5120);
      const newIp = primary_ip !== undefined ? primary_ip.trim() : (app.primary_ip || '0.0.0.0');
      const newDomain = domain !== undefined ? domain.trim() : (app.domain || '');
      const newRVersion = runtime_version !== undefined ? runtime_version.trim() : (app.runtime_version || '');
      const newStartupCmd = startup_cmd !== undefined ? startup_cmd : (app.startup_cmd || '');
      const newMainFile = main_file !== undefined ? main_file.trim() : (app.main_file || app.entrypoint);
      const newPackages = node_packages !== undefined ? node_packages : (app.node_packages || '');
      const newUnPackages = unnode_packages !== undefined ? unnode_packages : (app.unnode_packages || '');
      const newArgs = node_args !== undefined ? node_args : (app.node_args || '');
      const newReqs = requirements_file !== undefined ? requirements_file : (app.requirements_file || 'requirements.txt');
      const newEnv = env_vars !== undefined ? (typeof env_vars === 'object' ? JSON.stringify(env_vars) : env_vars) : app.env_vars;
      
      const newEngine = engine !== undefined ? engine.trim().toLowerCase() : (app.engine || '');
      const newGameVersion = game_version !== undefined ? game_version.trim() : (app.game_version || '');
      const newDbPassword = db_password !== undefined ? db_password.trim() : (app.db_password || '');
      const newDbName = db_name !== undefined ? db_name.trim() : (app.db_name || '');

      let newFolder = app.folder_name || supervisor.sanitizeFolderName(app.name);
      if (newName && newName.trim() !== app.name) {
        const oldDir = supervisor.getAppDir(app);
        newFolder = supervisor.sanitizeFolderName(newName.trim());
        const newDir = path.join(config.appsDir, newFolder);
        if (fs.existsSync(oldDir) && oldDir !== newDir && !fs.existsSync(newDir)) {
          try {
            fs.renameSync(oldDir, newDir);
            console.log(`[AppController] 📁 Renamed server directory from ${oldDir} -> ${newDir}`);
          } catch (e) {
            console.warn(`[AppController] Could not rename folder: ${e.message}`);
          }
        }
      }

      const updateStmt = db.prepare(`
        UPDATE apps
        SET name = ?, type = ?, entrypoint = ?, port = ?, env_vars = ?, auto_restart = ?, 
            memory_limit = ?, cpu_limit = ?, disk_limit = ?, primary_ip = ?, domain = ?,
            runtime_version = ?, startup_cmd = ?, main_file = ?, node_packages = ?,
            unnode_packages = ?, node_args = ?, requirements_file = ?, folder_name = ?,
            engine = ?, game_version = ?, db_password = ?, db_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(
        newName, newType, newEntrypoint, newPort, newEnv, newAutoRestart, 
        newMem, newCpu, newDisk, newIp, newDomain,
        newRVersion, newStartupCmd, newMainFile, newPackages,
        newUnPackages, newArgs, newReqs, newFolder,
        newEngine, newGameVersion, newDbPassword, newDbName, id
      );

      // Reconfigure port in config files if changed
      if (newPort && newPort !== app.port) {
        const appDir = supervisor.getAppDir({ ...app, folder_name: newFolder });
        if (currentCategory === 'minecraft') {
          MinecraftRunner.configureServerFiles({ id, name: newName, port: newPort }, appDir);
        } else if (currentCategory === 'database') {
          DatabaseRunner.setupDatabase({ id, name: newName, port: newPort, engine: newEngine, db_password: newDbPassword, db_name: newDbName, memory_limit: newMem }, appDir);
        }
      }

      logStreamer.append(id, 'system', `[Config Updated] Specs updated: Port=${newPort}, RAM=${newMem}MB, CPU=${newCpu}%, Disk=${newDisk}MB, IP=${newIp}, Domain=${newDomain}`);

      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'CONFIG_UPDATE',
        details: `Updated configuration for "${newName}": Port=${newPort}, RAM=${newMem}MB, CPU=${newCpu}%, Disk=${newDisk}MB, IP=${newIp}`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId: id
      });

      return res.json({ message: 'Server specs and settings updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getStartup(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'power') && !checkAppAccess(id, req.user, 'console')) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions to perform server actions' });
      }

      const defaultNodeStartup = `if [[ -d .git ]] && [[ 0 == "1" ]]; then git pull; fi; if [[ ! -z "\${NODE_PACKAGES}" ]]; then /usr/local/bin/npm install \${NODE_PACKAGES}; fi; if [[ ! -z "\${UNNODE_PACKAGES}" ]]; then /usr/local/bin/npm uninstall \${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; if [[ "\${MAIN_FILE##*.}" == "js" ]]; then /usr/local/bin/node "/home/container/\${MAIN_FILE}" \${NODE_ARGS}; else /usr/local/bin/ts-node --esm "/home/container/\${MAIN_FILE}" \${NODE_ARGS}; fi`;
      const defaultPythonStartup = `if [[ -d .git ]] && [[ "0" == "1" ]]; then git pull; fi; if [[ ! -z "" ]]; then pip install -U --prefix .local ; fi; if [[ -f /home/container/\${REQUIREMENTS_FILE} ]]; then pip install -U --prefix .local -r \${REQUIREMENTS_FILE}; fi; /usr/local/bin/python /home/container/main.py`;

      const category = app.server_category || (['minecraft', 'database'].includes(app.type) ? app.type : 'software');

      return res.json({
        startup: {
          type: app.type,
          server_category: category,
          engine: app.engine || (category === 'minecraft' ? 'paper' : (category === 'database' ? 'redis' : '')),
          game_version: app.game_version || (category === 'minecraft' ? '1.21.1' : ''),
          db_password: app.db_password || '',
          db_name: app.db_name || '',
          runtime_version: app.runtime_version || (app.type === 'nodejs' ? '20' : (app.type === 'python' ? '3.11' : '')),
          startup_cmd: app.startup_cmd || (app.type === 'nodejs' ? defaultNodeStartup : defaultPythonStartup),
          main_file: app.main_file || app.entrypoint || (app.type === 'nodejs' ? 'index.js' : (app.type === 'python' ? 'main.py' : 'server.jar')),
          node_packages: app.node_packages || '',
          unnode_packages: app.unnode_packages || '',
          node_args: app.node_args || '',
          requirements_file: app.requirements_file || 'requirements.txt',
          defaults: {
            nodejs: defaultNodeStartup,
            python: defaultPythonStartup
          }
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async updateStartup(req, res) {
    try {
      const { id } = req.params;
      const { 
        type, 
        runtime_version, 
        startup_cmd, 
        main_file, 
        node_packages, 
        unnode_packages, 
        node_args, 
        requirements_file,
        engine,
        game_version,
        db_password,
        db_name
      } = req.body;

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'power') && !checkAppAccess(id, req.user, 'console')) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions to perform server actions' });
      }

      const category = app.server_category || (['minecraft', 'database'].includes(app.type) ? app.type : 'software');

      if (category === 'minecraft') {
        const newEngine = engine ? engine.trim().toLowerCase() : (app.engine || 'paper');
        const newGameVersion = game_version ? game_version.trim() : (app.game_version || '1.21.1');
        
        db.prepare(`
          UPDATE apps
          SET engine = ?, game_version = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newEngine, newGameVersion, id);

        if (newEngine !== app.engine || newGameVersion !== app.game_version) {
          const appDir = supervisor.getAppDir(app);
          const jarPath = path.join(appDir, 'server.jar');
          try { if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath); } catch (e) {}
          MinecraftRunner.setupMinecraftServer({ ...app, engine: newEngine, game_version: newGameVersion }, appDir)
            .then(() => logStreamer.append(id, 'system', `[Minecraft Startup] Re-provisioned server.jar for ${newEngine.toUpperCase()} ${newGameVersion}`))
            .catch(err => logStreamer.append(id, 'stderr', `[Minecraft Startup] Error provisioning new JAR: ${err.message}`));
        }

        logStreamer.append(id, 'system', `[Startup Updated] Minecraft engine updated to ${newEngine.toUpperCase()} (MC ${newGameVersion})`);
        recordAuditLog({
          userId: req.user.id,
          username: req.user.username,
          action: 'STARTUP_UPDATE',
          details: `Minecraft engine updated to ${newEngine.toUpperCase()} (MC ${newGameVersion})`,
          ip: req.ip || req.socket?.remoteAddress || '',
          appId: id
        });
        return res.json({ message: 'Minecraft engine and version updated successfully' });
      }

      if (category === 'database') {
        const newEngine = engine ? engine.trim().toLowerCase() : (app.engine || 'redis');
        const newPassword = db_password !== undefined ? db_password.trim() : (app.db_password || '');
        const newDbName = db_name !== undefined ? db_name.trim() : (app.db_name || '');

        db.prepare(`
          UPDATE apps
          SET engine = ?, db_password = ?, db_name = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newEngine, newPassword, newDbName, id);

        // Regenerate DB config files
        const appDir = supervisor.getAppDir(app);
        DatabaseRunner.setupDatabase({ ...app, engine: newEngine, db_password: newPassword, db_name: newDbName }, appDir);

        logStreamer.append(id, 'system', `[Startup Updated] Database engine set to ${newEngine.toUpperCase()}`);
        recordAuditLog({
          userId: req.user.id,
          username: req.user.username,
          action: 'STARTUP_UPDATE',
          details: `Database engine updated to ${newEngine.toUpperCase()}`,
          ip: req.ip || req.socket?.remoteAddress || '',
          appId: id
        });
        return res.json({ message: 'Database parameters updated successfully' });
      }

      // Software Category (NodeJS / Python)
      const newType = type ? type.trim().toLowerCase() : app.type;
      if (!['nodejs', 'python'].includes(newType)) {
        return res.status(400).json({ error: 'Invalid runtime type. Allowed: nodejs, python' });
      }
      const newVersion = runtime_version ? runtime_version.trim() : (app.runtime_version || '');
      const newCmd = startup_cmd !== undefined ? startup_cmd : app.startup_cmd;
      const newMain = main_file ? main_file.trim() : (app.main_file || app.entrypoint);
      const newPkg = node_packages !== undefined ? node_packages : (app.node_packages || '');
      const newUnPkg = unnode_packages !== undefined ? unnode_packages : (app.unnode_packages || '');
      const newArgs = node_args !== undefined ? node_args : (app.node_args || '');
      const newReq = requirements_file !== undefined ? requirements_file : (app.requirements_file || 'requirements.txt');

      const updateStmt = db.prepare(`
        UPDATE apps
        SET type = ?, runtime_version = ?, startup_cmd = ?, main_file = ?, entrypoint = ?,
            node_packages = ?, unnode_packages = ?, node_args = ?, requirements_file = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run(newType, newVersion, newCmd, newMain, newMain, newPkg, newUnPkg, newArgs, newReq, id);

      logStreamer.append(id, 'system', `[Startup Updated] Runtime changed to ${newType} (v${newVersion}), Main=${newMain}`);
      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'STARTUP_UPDATE',
        details: `Runtime changed to ${newType} (v${newVersion}), Main=${newMain}`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId: id
      });

      return res.json({ message: 'Startup parameters updated successfully' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async sendCommand(req, res) {
    try {
      const { id } = req.params;
      const { command } = req.body;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'Server not found' });

      if (!checkAppAccess(id, req.user, 'power') && !checkAppAccess(id, req.user, 'console')) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions to perform server actions' });
      }

      const result = await supervisor.sendCommand(id, command);
      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'CONSOLE_COMMAND',
        details: `Ran terminal command: "${command}"`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId: id
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async deleteApp(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'power') && !checkAppAccess(id, req.user, 'console')) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions to perform server actions' });
      }

      // Force kill process and release TCP port
      const appPort = app.port;
      await supervisor.killApp(id);
      if (appPort) {
        try {
          if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${appPort}`).toString();
            for (const line of out.split('\n')) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              if (pid && pid !== '0') execSync(`taskkill /pid ${pid} /F 2>nul`);
            }
          } else {
            execSync(`fuser -k -9 ${appPort}/tcp 2>/dev/null || true`);
            execSync(`kill -9 $(lsof -t -i:${appPort}) 2>/dev/null || true`);
          }
        } catch (e) {}
      }

      // Clean directory from disk
      const appDir = supervisor.getAppDir(app);
      try {
        if (fs.existsSync(appDir)) {
          fs.rmSync(appDir, { recursive: true, force: true });
          console.log(`[AppController] 🗑️ Deleted server directory: ${appDir}`);
        }
      } catch (e) {
        console.warn(`Could not delete app folder: ${e.message}`);
      }

      // Also clean legacy ID directory if it exists and differs
      if (app.id) {
        const idDir = path.join(config.appsDir, app.id);
        if (fs.existsSync(idDir) && idDir !== appDir) {
          try { fs.rmSync(idDir, { recursive: true, force: true }); } catch (e) {}
        }
      }

      // Delete from DB
      const delStmt = db.prepare('DELETE FROM apps WHERE id = ?');
      delStmt.run(id);

      logStreamer.clear(id);

      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'SERVER_DELETE',
        details: `Permanently deleted server "${app.name}" (ID: ${id})`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId: id
      });

      return res.json({ message: 'Application deleted permanently' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async performAction(req, res) {
    try {
      const { id, action } = req.params;
      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'App not found' });

      if (!checkAppAccess(id, req.user, 'power') && !checkAppAccess(id, req.user, 'console')) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions to perform server actions' });
      }

      const actionMap = {
        start: 'SERVER_START',
        stop: 'SERVER_STOP',
        restart: 'SERVER_RESTART',
        kill: 'SERVER_KILL',
        install: 'DEPENDENCY_INSTALL'
      };
      const auditAction = actionMap[action.toLowerCase()] || `ACTION_${action.toUpperCase()}`;
      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: auditAction,
        details: `Executed power action "${action}" on server "${app.name}"`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId: id
      });

      switch (action.toLowerCase()) {
        case 'start': {
          const result = await supervisor.startApp(id);
          return res.json(result);
        }
        case 'stop': {
          const result = await supervisor.stopApp(id);
          return res.json(result);
        }
        case 'restart': {
          const result = await supervisor.restartApp(id);
          return res.json(result);
        }
        case 'kill': {
          const result = await supervisor.killApp(id);
          return res.json(result);
        }
        case 'install': {
          supervisor.installDependencies(id)
            .then(() => logStreamer.append(id, 'system', '[Daemon] Dependencies installation finished.'))
            .catch((err) => logStreamer.append(id, 'system', `[Daemon] Dependency installation failed: ${err.message}`));
          return res.json({ message: 'Dependency installation started in background. Monitor live logs.' });
        }
        default:
          return res.status(400).json({ error: `Unknown action: "${action}". Valid actions: start, stop, restart, kill, install` });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getLogs(req, res) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit || '200', 10);
      const logs = logStreamer.getLogs(id, limit);
      return res.json({ logs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getStats(req, res) {
    try {
      const { id } = req.params;
      const metrics = supervisor.getMetrics(id);
      return res.json({ metrics });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getActivity(req, res) {
    try {
      const { id } = req.params;
      const stmt = db.prepare(`
        SELECT id, action, details, ip_address, created_at, username, app_id 
        FROM audit_logs 
        WHERE app_id = ? OR details LIKE ? OR action LIKE ?
        ORDER BY created_at DESC 
        LIMIT 100
      `);
      const param = '%' + id + '%';
      const logs = stmt.all(id, param, param);
      return res.json({ success: true, activity: logs });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async setDomain(req, res) {
    try {
      const { id } = req.params;
      const { domain } = req.body;
      const cleanDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const panelDomain = (config.panelDomain || '').toLowerCase();
      if (cleanDomain && (cleanDomain === panelDomain || cleanDomain === 'localhost' || cleanDomain === '127.0.0.1')) {
        return res.status(400).json({ error: 'Cannot attach system panel domain to individual applications' });
      }
      db.prepare('UPDATE apps SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanDomain, id);
      recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'DOMAIN_UPDATE',
        details: `Updated custom domain to "${cleanDomain}"`,
        ip: req.ip || req.socket?.remoteAddress || '',
        appId: id
      });
      return res.json({ success: true, domain: cleanDomain, message: 'Custom domain saved' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async verifyDomain(req, res) {
    try {
      const { id } = req.params;
      const { domain } = req.body;
      const targetDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
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
          ? `DNS verified successfully! Domain resolves to ${resolvedIps.join(', ')}`
          : `Could not resolve DNS records for ${targetDomain}. Please ensure your A or CNAME record has propagated.`
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async transferOwnership(req, res) {
    try {
      const { id } = req.params;
      const { target_user } = req.body;

      if (!target_user) {
        return res.status(400).json({ error: 'Target username or email is required' });
      }

      const stmt = db.prepare('SELECT * FROM apps WHERE id = ?');
      const app = stmt.get(id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      if (req.user.role !== 'admin' && app.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Only current owner or administrator can transfer server ownership' });
      }

      const target = db.prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?')
        .get(target_user.trim().toLowerCase(), target_user.trim().toLowerCase());

      if (!target) {
        return res.status(404).json({ error: `User "${target_user}" not found in system` });
      }

      if (target.id === app.user_id) {
        return res.status(400).json({ error: 'This user is already the owner of this server' });
      }

      db.prepare('UPDATE apps SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(target.id, id);

      try {
        db.prepare('DELETE FROM app_collaborators WHERE app_id = ? AND user_id = ?').run(id, target.id);
      } catch (e) {}

      logStreamer.append(id, 'system', `[Ownership Transferred] Server ownership transferred from User #${app.user_id} to @${target.username} (ID: ${target.id}) by @${req.user.username || 'admin'}`);

      return res.json({
        success: true,
        message: `Server successfully transferred to @${target.username}!`,
        new_owner: { id: target.id, username: target.username, email: target.email }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
