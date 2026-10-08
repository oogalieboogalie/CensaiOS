// Client for /api/docker plus the small formatters every Docker panel uses.

export class DockerApiError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.status = status;
    this.reason = reason || null;
  }
}

async function request(path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`/api/docker${path}${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const reason = data?.reason || (res.status === 403 ? 'forbidden' : null);
    throw new DockerApiError(data?.error || `Request failed (${res.status})`, { status: res.status, reason });
  }
  return data;
}

const enc = encodeURIComponent;

export const dockerApi = {
  status: () => request('/status'),
  containers: () => request('/containers').then((d) => d.containers || []),
  stats: () => request('/stats').then((d) => d.stats || []),
  inspect: (id) => request(`/containers/${enc(id)}`),
  logs: (id, tail = 300) => request(`/containers/${enc(id)}/logs`, { query: { tail } }).then((d) => d.lines || []),
  action: (id, action) => request(`/containers/${enc(id)}/${action}`, { method: 'POST' }),
  remove: (id, { force = true, volumes = false } = {}) => request(`/containers/${enc(id)}`, {
    method: 'DELETE', query: { force: String(force), volumes: String(volumes) },
  }),
  exec: (id, command) => request(`/containers/${enc(id)}/exec`, { method: 'POST', body: { command } }),
  images: () => request('/images').then((d) => d.images || []),
  pullImage: (ref) => request('/images/pull', { method: 'POST', body: { ref } }),
  removeImage: (ref, force = false) => request('/images', { method: 'DELETE', query: { ref, force: String(force) } }),
  volumes: () => request('/volumes').then((d) => d.volumes || []),
  removeVolume: (name) => request(`/volumes/${enc(name)}`, { method: 'DELETE' }),
  networks: () => request('/networks').then((d) => d.networks || []),
  removeNetwork: (name) => request(`/networks/${enc(name)}`, { method: 'DELETE' }),
  compose: () => request('/compose').then((d) => d.projects || []),
  composeAction: (project, action) => request(`/compose/${enc(project)}/${action}`, { method: 'POST' }),
  prune: (target) => request(`/prune/${target}`, { method: 'POST' }),
};

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatPercent(p) {
  const n = Number(p) || 0;
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)}%`;
}

export function formatPorts(ports) {
  // "0.0.0.0:8080->80/tcp, :::8080->80/tcp" -> unique "8080→80"
  const seen = new Set();
  for (const p of ports || []) {
    const m = String(p).match(/:(\d+)->(\d+)/);
    seen.add(m ? `${m[1]}→${m[2]}` : String(p).replace(/\/tcp$/, ''));
  }
  return [...seen];
}

export function shortTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// Visual tone for a container: drives the status dot and badge colour.
export function containerTone(c) {
  if (c.health === 'unhealthy') return 'danger';
  if (c.state === 'running' && c.health === 'starting') return 'warn';
  if (c.state === 'running') return 'ok';
  if (c.state === 'paused' || c.state === 'restarting') return 'warn';
  if (c.state === 'exited' && /Exited \((?!0\))/.test(c.status)) return 'danger';
  return 'idle';
}

export function stateLabel(c) {
  if (c.health === 'unhealthy') return 'Unhealthy';
  if (c.state === 'running' && c.health === 'starting') return 'Starting';
  const map = { running: 'Running', exited: 'Stopped', paused: 'Paused', restarting: 'Restarting', created: 'Created', dead: 'Dead', removing: 'Removing' };
  return map[c.state] || c.state;
}
