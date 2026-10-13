// Pure parsers that turn docker CLI JSON into the stable camelCase shapes
// the window renders. No I/O here, so they're easy to unit test.

import { parseLabels } from './cli.js';

const SECRET_KEY = /(secret|token|passw|pwd|api[_-]?key|private|credential|auth)/i;

export function parseHealth(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('(unhealthy)')) return 'unhealthy';
  if (s.includes('(healthy)')) return 'healthy';
  if (s.includes('health: starting')) return 'starting';
  return null;
}

export function splitList(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** "12.5MiB / 7.6GiB" -> bytes; tolerant of the decimal (kB/MB) units too. */
export function parseSize(text) {
  const m = String(text || '').trim().match(/^([\d.]+)\s*([kKmMgGtT]?i?)B?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const base = unit.endsWith('i') ? 1024 : 1000;
  const power = { '': 0, k: 1, ki: 1, m: 2, mi: 2, g: 3, gi: 3, t: 4, ti: 4 }[unit] ?? 0;
  return Math.round(n * base ** power);
}

export function normalizeContainer(c) {
  const labels = parseLabels(c.Labels);
  const name = String(c.Names || c.Name || '').split(',')[0];
  return {
    id: c.ID,
    shortId: String(c.ID || '').slice(0, 12),
    name,
    image: c.Image,
    command: c.Command,
    state: String(c.State || '').toLowerCase() || 'unknown',
    status: c.Status || '',
    health: parseHealth(c.Status),
    createdAt: c.CreatedAt || null,
    runningFor: c.RunningFor || '',
    ports: splitList(c.Ports),
    networks: splitList(c.Networks),
    mounts: splitList(c.Mounts),
    composeProject: labels['com.docker.compose.project'] || null,
    composeService: labels['com.docker.compose.service'] || null,
    sandbox: name.startsWith('homebase-sbx-'),
    hostPath: labels['homebase.hostPath'] || null,
  };
}

export function normalizeStats(s) {
  const [memUsed, memLimit] = String(s.MemUsage || '').split('/');
  const [netRx, netTx] = String(s.NetIO || '').split('/');
  const [blockRead, blockWrite] = String(s.BlockIO || '').split('/');
  return {
    id: String(s.ID || s.Container || '').slice(0, 12),
    name: s.Name,
    cpu: parseFloat(s.CPUPerc) || 0,
    memPercent: parseFloat(s.MemPerc) || 0,
    memUsed: parseSize(memUsed),
    memLimit: parseSize(memLimit),
    netRx: parseSize(netRx),
    netTx: parseSize(netTx),
    blockRead: parseSize(blockRead),
    blockWrite: parseSize(blockWrite),
    pids: parseInt(s.PIDs, 10) || 0,
  };
}

export function maskEnv(entry) {
  const idx = entry.indexOf('=');
  if (idx < 0) return { key: entry, value: '', masked: false };
  const key = entry.slice(0, idx);
  const masked = SECRET_KEY.test(key);
  return { key, value: masked ? '••••••' : entry.slice(idx + 1), masked };
}

export function summarizeInspect(raw) {
  const cfg = raw.Config || {};
  const st = raw.State || {};
  const host = raw.HostConfig || {};
  const ports = Object.entries(raw.NetworkSettings?.Ports || {}).map(([target, bindings]) => ({
    target,
    published: (bindings || []).map((b) => `${b.HostIp || '0.0.0.0'}:${b.HostPort}`),
  }));
  return {
    id: raw.Id,
    name: String(raw.Name || '').replace(/^\//, ''),
    image: cfg.Image,
    imageId: raw.Image,
    created: raw.Created,
    command: [...(cfg.Entrypoint || []), ...(cfg.Cmd || [])].join(' '),
    workingDir: cfg.WorkingDir || '',
    state: {
      status: st.Status, running: !!st.Running, paused: !!st.Paused, restarting: !!st.Restarting,
      exitCode: st.ExitCode, error: st.Error || '', startedAt: st.StartedAt, finishedAt: st.FinishedAt,
      oomKilled: !!st.OOMKilled, pid: st.Pid,
    },
    health: st.Health ? {
      status: st.Health.Status,
      failingStreak: st.Health.FailingStreak,
      log: (st.Health.Log || []).slice(-5).map((l) => ({ exitCode: l.ExitCode, output: String(l.Output || '').trim(), end: l.End })),
    } : null,
    restartPolicy: host.RestartPolicy?.Name || 'no',
    restartCount: raw.RestartCount || 0,
    env: (cfg.Env || []).map(maskEnv),
    labels: cfg.Labels || {},
    ports,
    mounts: (raw.Mounts || []).map((m) => ({
      type: m.Type, name: m.Name || null, source: m.Source, destination: m.Destination, mode: m.Mode, rw: m.RW,
    })),
    networks: Object.entries(raw.NetworkSettings?.Networks || {}).map(([name, n]) => ({
      name, ipAddress: n.IPAddress || '', gateway: n.Gateway || '', aliases: n.Aliases || [],
    })),
  };
}
