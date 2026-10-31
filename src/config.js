import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

dotenv.config();

const ROOT_DIR = process.cwd();
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage');
const APPS_DIR = process.env.APPS_DIR || path.join(STORAGE_DIR, 'apps');
const DATA_DIR = process.env.DATA_DIR || path.join(STORAGE_DIR, 'data');

// Ensure essential directories exist
[STORAGE_DIR, APPS_DIR, DATA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const isWindows = os.platform() === 'win32';

export const config = {
  port: parseInt(process.env.PORT || '8090', 10),
  panelDomain: process.env.PANEL_DOMAIN || process.env.BASE_DOMAIN || '',
  baseDomain: process.env.BASE_DOMAIN || '',
  vpsPublicIp: process.env.VPS_PUBLIC_IP || '',
  jwtSecret: process.env.JWT_SECRET || 'eclipse-secret-key-change-in-production-vps-98213812',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  rootDir: ROOT_DIR,
  storageDir: STORAGE_DIR,
  appsDir: APPS_DIR,
  dataDir: DATA_DIR,
  dbType: process.env.DB_TYPE || 'sqlite', // 'mariadb' | 'sqlite'
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: parseInt(process.env.DB_PORT || '3306', 10),
  dbName: process.env.DB_NAME || 'eclipse_panel',
  dbUser: process.env.DB_USER || 'eclipse_user',
  dbPassword: process.env.DB_PASSWORD || '',
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'eclipse.db'),
  pythonBin: process.env.PYTHON_BIN || (isWindows ? 'python' : 'python3'),
  nodeBin: process.env.NODE_BIN || 'node',
  npmBin: process.env.NPM_BIN || (isWindows ? 'npm.cmd' : 'npm'),
  maxLogLines: parseInt(process.env.MAX_LOG_LINES || '1000', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  clusterSecret: process.env.CLUSTER_SECRET || '',
  autoStartOnBoot: process.env.AUTO_START_ON_BOOT !== 'false',
  systemStatsIntervalMs: 2000,
};
