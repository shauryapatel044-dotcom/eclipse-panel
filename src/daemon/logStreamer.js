import { EventEmitter } from 'events';
import { config } from '../config.js';

class LogStreamer extends EventEmitter {
  constructor() {
    super();
    // Map of appId -> Array of log objects: { timestamp, stream, message }
    this.logs = new Map();
  }

  append(appId, stream, message) {
    if (!this.logs.has(appId)) {
      this.logs.set(appId, []);
    }

    const appLogBuffer = this.logs.get(appId);
    const entry = {
      timestamp: new Date().toISOString(),
      stream, // 'stdout' | 'stderr' | 'system'
      message: message.toString(),
    };

    appLogBuffer.push(entry);

    if (appLogBuffer.length > config.maxLogLines) {
      appLogBuffer.shift();
    }

    // Emit event for WebSocket clients
    this.emit(`log:${appId}`, entry);
    this.emit('log', { appId, ...entry });
  }

  getLogs(appId, limit = 200) {
    const list = this.logs.get(appId) || [];
    return list.slice(-limit);
  }

  clear(appId) {
    this.logs.set(appId, []);
  }
}

export const logStreamer = new LogStreamer();
