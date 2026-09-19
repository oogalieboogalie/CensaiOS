import express from 'express';
import os from 'os';
import { exec as _exec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(_exec);
const router = express.Router();

function humanUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

async function listContainers() {
  try {
    const [{ stdout: psOut }, { stdout: statsOut }] = await Promise.all([
      exec('docker ps --format "{{.Names}}|||{{.Status}}|||{{.Ports}}"'),
      exec('docker stats --no-stream --format "{{.Name}}|||{{.CPUPerc}}|||{{.MemUsage}}"'),
    ]);
    const statsMap = new Map();
    for (const line of statsOut.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [name, cpu, mem] = line.split('|||');
      statsMap.set(name, { cpu: cpu?.trim() || null, mem: mem?.trim() || null });
    }

    const containers = [];
    for (const line of psOut.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [name, status, ports] = line.split('|||');
      const st = statsMap.get(name) || {};
      containers.push({ name: name?.trim(), status: status?.trim(), ports: ports?.trim(), cpu: st.cpu || null, mem: st.mem || null });
    }
    return containers;
  } catch (err) {
    return { error: String(err) };
  }
}

router.get('/status', async (req, res) => {
  try {
    const uptimeSec = os.uptime();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const load = os.loadavg();
    const containers = await listContainersCached();
    res.json({
      host: {
        platform: os.platform(),
        release: os.release(),
        uptime_seconds: Math.floor(uptimeSec),
        uptime_human: humanUptime(Math.floor(uptimeSec)),
        total_mem: totalMem,
        free_mem: freeMem,
        load_average: load,
      },
      containers,
      now: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export { router as systemStatusRouter };

// Docker stats collection costs ~1-2s per call and the widget polls every
// 10s, so container data is cached briefly. Host stats stay live.
const CONTAINER_TTL_MS = 15_000;
let containerCache = { at: 0, value: null };

async function listContainersCached() {
  if (containerCache.value && Date.now() - containerCache.at < CONTAINER_TTL_MS) {
    return containerCache.value;
  }
  const value = await listContainers();
  containerCache = { at: Date.now(), value };
  return value;
}

// Test-only: drop the cached container snapshot.
export function __resetSystemStatusCache() {
  containerCache = { at: 0, value: null };
}
