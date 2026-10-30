import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logStreamer } from '../daemon/logStreamer.js';
import { getSystemStats } from '../daemon/metrics.js';
import { supervisor } from '../daemon/supervisor.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.subscriptions = new Set();
    ws.user = null;

    // Optional query parameter token authentication
    const url = new URL(req.url, 'http://localhost');
    const tokenQuery = url.searchParams.get('token');
    if (tokenQuery) {
      try {
        const decoded = jwt.verify(tokenQuery, config.jwtSecret);
        ws.user = decoded;
      } catch (e) {
        // Token invalid, client can re-authenticate via message
      }
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'auth') {
          try {
            const decoded = jwt.verify(msg.token, config.jwtSecret);
            ws.user = decoded;
            ws.send(JSON.stringify({ type: 'auth_success', user: decoded }));
          } catch (e) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token' }));
          }
          return;
        }

        if (msg.type === 'subscribe') {
          // Channel format: 'logs:<appId>' or 'system:stats'
          const { channel } = msg;
          if (channel) {
            ws.subscriptions.add(channel);
            ws.send(JSON.stringify({ type: 'subscribed', channel }));
          }
          return;
        }

        if (msg.type === 'unsubscribe') {
          const { channel } = msg;
          if (channel) {
            ws.subscriptions.delete(channel);
            ws.send(JSON.stringify({ type: 'unsubscribed', channel }));
          }
          return;
        }
      } catch (err) {
        console.error('[WS Message Error]:', err.message);
      }
    });

    ws.on('close', () => {
      ws.subscriptions.clear();
    });
  });

  // Listen to logStreamer events and broadcast to subscribed sockets
  logStreamer.on('log', (data) => {
    const channel = `logs:${data.appId}`;
    const payload = JSON.stringify({
      type: 'log',
      appId: data.appId,
      stream: data.stream,
      message: data.message,
      timestamp: data.timestamp,
    });

    for (const client of wss.clients) {
      if (client.readyState === 1 && client.subscriptions.has(channel)) {
        client.send(payload);
      }
    }
  });

  // Periodic System Stats broadcaster
  setInterval(() => {
    if (wss.clients.size === 0) return;

    const stats = getSystemStats();
    let runningCount = 0;
    for (const [appId] of supervisor.managedProcesses) {
      if (supervisor.isRunning(appId)) runningCount++;
    }

    const payload = JSON.stringify({
      type: 'system_stats',
      data: {
        ...stats,
        runningApps: runningCount,
      },
    });

    for (const client of wss.clients) {
      if (client.readyState === 1 && (client.subscriptions.has('system:stats') || (client.user && client.user.role === 'admin'))) {
        client.send(payload);
      }
    }
  }, config.systemStatsIntervalMs);

  // Ping interval to keep connections alive
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  return wss;
}
