import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase } from './database/index.js';
import { supervisor } from './daemon/supervisor.js';
import { setupWebSocket } from './websocket/wsServer.js';
import { getSystemStats } from './daemon/metrics.js';

// Route handlers
import authRoutes from './routes/auth.js';
import appRoutes from './routes/apps.js';
import adminRoutes from './routes/admin.js';
import fileRoutes from './routes/files.js';
import nodeRoutes from './routes/nodes.js';

const app = express();

// Public / Frontend Directory
const PUBLIC_DIR = path.join(config.rootDir, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health & Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Eclipse Panel Daemon & API',
    port: config.port,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Real-Time System Metrics (CPU model, Cores count, RAM, Disk)
app.get('/api/system/metrics', (req, res) => {
  res.json(getSystemStats());
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/nodes', nodeRoutes);

// Convenient Page Route Mappings
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/app', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin-stats.html')));
app.get('/admin-stats', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin-stats.html')));

// Static frontend serving
app.use(express.static(PUBLIC_DIR));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
    return next();
  }
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl}` });
});

// API 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Create HTTP server & bind WebSocket
const server = http.createServer(app);
setupWebSocket(server);

// Start Server & Boot
async function start() {
  try {
    initDatabase();

    server.listen(config.port, () => {
      console.log(`=======================================================`);
      console.log(`  🌑 ECLIPSE PANEL DAEMON & API ENGINE ONLINE 🌑       `);
      console.log(`  Local URL : http://localhost:${config.port}          `);
      console.log(`  API Base  : http://localhost:${config.port}/api      `);
      console.log(`  WebSocket : ws://localhost:${config.port}/ws        `);
      console.log(`  Frontend  : ${PUBLIC_DIR}                            `);
      console.log(`  Apps Root : ${config.appsDir}                         `);
      console.log(`  Database  : ${config.dbPath}                          `);
      console.log(`=======================================================`);

      supervisor.bootAllAutoStartApps();
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

// Graceful Shutdown
async function shutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Stopping running apps...`);
  for (const [appId] of supervisor.managedProcesses) {
    try {
      await supervisor.stopApp(appId);
    } catch (e) {
      console.error(`Error stopping ${appId}:`, e.message);
    }
  }
  server.close(() => {
    console.log('[Shutdown] Eclipse Panel server closed gracefully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
