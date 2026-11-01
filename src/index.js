import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase, db } from './database/index.js';
import { supervisor } from './daemon/supervisor.js';
import { setupWebSocket } from './websocket/wsServer.js';
import { getSystemStats } from './daemon/metrics.js';
import { discordBotService } from './services/discordBot.js';
import { AdminController } from './controllers/adminController.js';

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

// Reverse Proxy Middleware for Attached Custom Domains
app.use((req, res, next) => {
  const rawHost = (req.headers.host || '').split(':')[0].toLowerCase();
  
  if (!rawHost || rawHost === 'localhost' || rawHost === '127.0.0.1') {
    return next();
  }

  const panelDomain = (config.panelDomain || '').toLowerCase();
  if (rawHost === panelDomain) {
    return next();
  }

  // Check if host matches an attached app custom domain
  try {
    const matchedApp = db.prepare('SELECT id, name, port, status FROM apps WHERE LOWER(domain) = ?').get(rawHost);
    if (matchedApp && matchedApp.port) {
      if (matchedApp.status !== 'online' && matchedApp.status !== 'running') {
        return res.status(503).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>${matchedApp.name} · Offline</title>
            <style>
              body { background: #0A0B10; color: #E2E8F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { background: #121422; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }
              .badge { display: inline-block; background: rgba(239, 68, 68, 0.15); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
              h1 { font-size: 20px; margin: 0 0 10px 0; color: #FFF; }
              p { color: #94A3B8; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0; }
              .brand { font-size: 11px; color: #64748B; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
            </style>
          </head>
          <body>
            <div class="card">
              <span class="badge">Application ${matchedApp.status}</span>
              <h1>${matchedApp.name}</h1>
              <p>This application is currently not running. Please start the container from your Eclipse Panel dashboard.</p>
              <div class="brand">Eclipse Panel · Reverse Proxy</div>
            </div>
          </body>
          </html>
        `);
      }

      // Proxy request directly to the container internal port
      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: matchedApp.port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          'x-forwarded-host': rawHost,
          'x-forwarded-proto': req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http'),
        },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).send(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>502 Bad Gateway · ${matchedApp.name}</title>
              <style>
                body { background: #0A0B10; color: #E2E8F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
                .card { background: #121422; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 32px; max-width: 460px; text-align: center; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }
                .badge { display: inline-block; background: rgba(239, 68, 68, 0.15); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-bottom: 16px; }
                h1 { font-size: 20px; margin: 0 0 10px 0; color: #FFF; }
                p { color: #94A3B8; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0; }
                .brand { font-size: 11px; color: #64748B; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
              </style>
            </head>
            <body>
              <div class="card">
                <span class="badge">502 Bad Gateway</span>
                <h1>${matchedApp.name} is not responding</h1>
                <p>The container is running, but no HTTP server is listening on port <strong>${matchedApp.port}</strong>. Make sure your application binds to <code>0.0.0.0:${matchedApp.port}</code>.</p>
                <div class="brand">Eclipse Panel · Reverse Proxy</div>
              </div>
            </body>
            </html>
          `);
        }
      });

      req.pipe(proxyReq);
      return;
    }
  } catch (e) {
    console.error('Domain proxy lookup error:', e);
  }

  next();
});

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true, limit: '50gb' }));

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

// Public Theme Config
app.get('/api/theme', AdminController.getTheme);

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
app.get('/account', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'account.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin-stats.html')));
app.get('/admin-stats', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin-stats.html')));
app.get('/designer', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'designer.html')));

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

    server.listen(config.port, '0.0.0.0', () => {
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
      discordBotService.init().catch(e => console.error('[DiscordBot] Startup error:', e.message));
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

// Graceful Shutdown & Process Stability
process.on('uncaughtException', (err) => {
  console.error('[Daemon Error] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Daemon Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function shutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Stopping running apps...`);
  try { await discordBotService.stop(); } catch (e) {}
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
