import os from 'os';
import fs from 'fs';
import { config } from '../config.js';

// Store previous CPU times sample for tick-delta computation
let prevCpus = os.cpus();

// Real VPS / Host Public IP Cache
let detectedPublicIp = null;
let lastPublicIpLookup = 0;

export async function refreshPublicIp() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        detectedPublicIp = data.ip;
        lastPublicIpLookup = Date.now();
        return detectedPublicIp;
      }
    }
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://icanhazip.com', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text && text.length >= 7 && text.length <= 45) {
        detectedPublicIp = text;
        lastPublicIpLookup = Date.now();
        return detectedPublicIp;
      }
    }
  } catch (e) {}

  return null;
}

// Background async probe on start
refreshPublicIp();

export function getHostIp() {
  if (config.vpsPublicIp && config.vpsPublicIp.trim() !== '') return config.vpsPublicIp.trim();
  if (detectedPublicIp) return detectedPublicIp;

  try {
    const ifaces = os.networkInterfaces();
    let lanCandidate = null;
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          const isPrivate = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(net.address);
          if (!isPrivate) {
            detectedPublicIp = net.address;
            return net.address;
          }
          if (!lanCandidate && !net.address.startsWith('169.254')) lanCandidate = net.address;
        }
      }
    }
    if (lanCandidate) return lanCandidate;
  } catch (e) {}

  return '127.0.0.1';
}

export function getCpuCoreMetrics() {
  const currentCpus = os.cpus();
  const cores = currentCpus.map((cpu, index) => {
    const prev = prevCpus[index] || cpu;
    const prevTotal = Object.values(prev.times).reduce((a, b) => a + b, 0);
    const currTotal = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const totalDiff = currTotal - prevTotal;
    const idleDiff = cpu.times.idle - prev.times.idle;

    let usagePercent = 0;
    if (totalDiff > 0) {
      usagePercent = Math.max(0, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
    }

    return {
      coreIndex: index,
      model: cpu.model,
      speedMHz: cpu.speed,
      usagePercent,
    };
  });

  // Update previous sample
  prevCpus = currentCpus;

  const overall = cores.length > 0 
    ? Math.round(cores.reduce((sum, c) => sum + c.usagePercent, 0) / cores.length) 
    : 0;

  return {
    overallPercent: overall,
    coresCount: cores.length,
    cores,
  };
}

export function getDiskUsage() {
  try {
    const rootPath = process.platform === 'win32' ? process.cwd().split(pathSeparator())[0] + '\\' : '/';
    const stats = fs.statfsSync(rootPath);
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bfree;
    const usedBytes = totalBytes - freeBytes;
    const usagePercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    return {
      path: rootPath,
      totalBytes,
      usedBytes,
      freeBytes,
      totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(1),
      usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(1),
      freeGB: (freeBytes / (1024 * 1024 * 1024)).toFixed(1),
      usagePercent,
    };
  } catch (err) {
    return {
      path: '/',
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      totalGB: '0',
      usedGB: '0',
      freeGB: '0',
      usagePercent: 0,
      error: err.message,
    };
  }
}

function pathSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}

export function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = Math.round((usedMem / totalMem) * 100);

  const cpuMetrics = getCpuCoreMetrics();
  const diskMetrics = getDiskUsage();

  return {
    ip: getHostIp(),
    domain: config.panelDomain || '',
    baseDomain: config.baseDomain || '',
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime()),
    loadAvg: os.loadavg ? os.loadavg() : [0, 0, 0],
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usagePercent: memUsagePercent,
      totalMB: Math.round(totalMem / (1024 * 1024)),
      usedMB: Math.round(usedMem / (1024 * 1024)),
      freeMB: Math.round(freeMem / (1024 * 1024)),
      totalGB: (totalMem / (1024 * 1024 * 1024)).toFixed(2),
      usedGB: (usedMem / (1024 * 1024 * 1024)).toFixed(2),
      freeGB: (freeMem / (1024 * 1024 * 1024)).toFixed(2),
    },
    cpu: {
      model: os.cpus().length > 0 ? os.cpus()[0].model : 'Unknown',
      cores: cpuMetrics.coresCount,
      overallPercent: cpuMetrics.overallPercent,
      coresList: cpuMetrics.cores,
    },
    disk: diskMetrics,
  };
}

export function estimateProcessMetrics(childProcess, startTime) {
  if (!childProcess || childProcess.killed || !childProcess.pid) {
    return {
      pid: null,
      running: false,
      uptimeSeconds: 0,
      memoryMB: 0,
      cpuPercent: 0,
    };
  }

  const uptimeSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  return {
    pid: childProcess.pid,
    running: true,
    uptimeSeconds,
    memoryMB: 0,
    cpuPercent: 0,
  };
}
