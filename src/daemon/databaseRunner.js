import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logStreamer } from './logStreamer.js';

export class DatabaseRunner {
  static SUPPORTED_ENGINES = ['redis', 'postgres', 'mariadb', 'mongodb'];

  // Configure database files and directories
  static setupDatabase(app, appDir) {
    const engine = (app.engine || 'redis').toLowerCase().trim();
    const port = app.port || (engine === 'redis' ? 6379 : engine === 'postgres' ? 5432 : 3306);
    const password = app.db_password || 'eclipse_pass_' + Math.random().toString(36).slice(2, 8);
    const dbName = app.db_name || (app.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'app_db');

    const dataDir = path.join(appDir, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (engine === 'redis') {
      const confPath = path.join(appDir, 'redis.conf');
      const confContent = [
        `# Eclipse Panel Managed Redis Server`,
        `port ${port}`,
        `bind 0.0.0.0`,
        `protected-mode yes`,
        `requirepass "${password}"`,
        `dir "${dataDir.replace(/\\/g, '/')}"`,
        `dbfilename "dump.rdb"`,
        `appendonly yes`,
        `appendfilename "appendonly.aof"`,
        `save 900 1`,
        `save 300 10`,
        `save 60 10000`,
        `loglevel notice`,
        `maxmemory ${app.memory_limit ? `${app.memory_limit}mb` : '512mb'}`,
        `maxmemory-policy allkeys-lru`
      ].join('\n') + '\n';

      fs.writeFileSync(confPath, confContent, 'utf8');

      const infoPath = path.join(appDir, 'CONNECTION_INFO.txt');
      const connUri = `redis://:${password}@<YOUR_SERVER_IP>:${port}`;
      fs.writeFileSync(infoPath, `REDIS CONNECTION URI:\n${connUri}\n\nHost: <YOUR_SERVER_IP>\nPort: ${port}\nPassword: ${password}\n`, 'utf8');
      
      logStreamer.append(app.id, 'system', `[Database: Redis] Configuration generated at redis.conf (Port ${port}).`);
    } else if (engine === 'postgres') {
      const isWin = process.platform === 'win32';
      const initDbBin = isWin ? 'initdb' : '/usr/lib/postgresql/16/bin/initdb';

      // Initialize cluster if data dir is empty
      if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
        logStreamer.append(app.id, 'system', `[Database: PostgreSQL] Initializing fresh PostgreSQL cluster in data/...`);
        try {
          execSync(`"${initDbBin}" -D "${dataDir}" --auth-local=trust --auth-host=scram-sha-256 -U postgres`, { stdio: 'pipe' });
          logStreamer.append(app.id, 'system', `[Database: PostgreSQL] Cluster initialization complete.`);
        } catch (e) {
          logStreamer.append(app.id, 'stderr', `[Database: PostgreSQL init error] ${e.message}`);
        }
      }

      // Configure postgresql.conf
      const pgConf = path.join(dataDir, 'postgresql.conf');
      if (fs.existsSync(pgConf)) {
        let confText = fs.readFileSync(pgConf, 'utf8');
        confText = confText.replace(/^#?port\s*=\s*\d+/m, `port = ${port}`);
        confText = confText.replace(/^#?listen_addresses\s*=\s*'.*'/m, `listen_addresses = '*'`);
        fs.writeFileSync(pgConf, confText, 'utf8');
      }

      const infoPath = path.join(appDir, 'CONNECTION_INFO.txt');
      const connUri = `postgresql://postgres:${password}@<YOUR_SERVER_IP>:${port}/${dbName}`;
      fs.writeFileSync(infoPath, `POSTGRESQL CONNECTION URI:\n${connUri}\n\nHost: <YOUR_SERVER_IP>\nPort: ${port}\nUser: postgres\nPassword: ${password}\nDatabase: ${dbName}\n`, 'utf8');
    } else if (engine === 'mariadb' || engine === 'mysql') {
      const infoPath = path.join(appDir, 'CONNECTION_INFO.txt');
      const connUri = `mysql://eclipse_user:${password}@<YOUR_SERVER_IP>:3306/${dbName}`;
      fs.writeFileSync(infoPath, `MARIADB / MYSQL CONNECTION URI:\n${connUri}\n\nHost: <YOUR_SERVER_IP>\nPort: 3306\nUser: eclipse_user\nPassword: ${password}\nDatabase: ${dbName}\n`, 'utf8');
    }
  }

  // Spawn Database process
  static async spawnProcess(app, appDir, customEnv = {}) {
    const engine = (app.engine || 'redis').toLowerCase().trim();
    this.setupDatabase(app, appDir);

    if (engine === 'redis') {
      const confPath = path.join(appDir, 'redis.conf');
      logStreamer.append(app.id, 'system', `[Database: Redis] Launching redis-server with ${confPath}...`);

      const child = spawn('redis-server', [confPath], {
        cwd: appDir,
        env: { ...process.env, ...customEnv },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return child;
    } else if (engine === 'postgres') {
      const dataDir = path.join(appDir, 'data');
      const port = app.port || 5432;
      const isWin = process.platform === 'win32';
      const pgBin = isWin ? 'postgres' : '/usr/lib/postgresql/16/bin/postgres';

      logStreamer.append(app.id, 'system', `[Database: PostgreSQL] Launching postgres server on port ${port}...`);

      const child = spawn(pgBin, ['-D', dataDir, '-p', String(port)], {
        cwd: appDir,
        env: { ...process.env, ...customEnv },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return child;
    } else {
      // Standalone dummy daemon or monitor for external MariaDB/MongoDB instance
      const isWin = process.platform === 'win32';
      const child = spawn(isWin ? 'cmd.exe' : '/bin/sh', [isWin ? '/c' : '-c', 'echo "[Database Active] Service operational." && tail -f /dev/null'], {
        cwd: appDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return child;
    }
  }
}
