// Client for /api/dev-servers (the Run dev window).
import { DockerApiError } from '../docker/dockerApi.js';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/dev-servers${path}`, {
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

export const devServerApi = {
  list: () => request(''),
  start: (opts) => request('', { method: 'POST', body: opts }),
  status: (name) => request(`/${enc(name)}`),
  stop: (name) => request(`/${enc(name)}`, { method: 'DELETE' }),
  heartbeat: (names) => request('/heartbeat', { method: 'POST', body: { names } }),
};

/** Last folder name, for titles: D:\Sites\shop -> shop */
export function folderName(folder) {
  return String(folder || '').split(/[\\/]/).filter(Boolean).pop() || '';
}

export const PHASE_COPY = {
  preparing: { tone: 'warn', text: 'Getting ready' },
  pulling: { tone: 'warn', text: 'Downloading the Node image (first run only)' },
  starting: { tone: 'warn', text: 'Starting the container' },
  installing: { tone: 'warn', text: 'Installing packages and starting the dev server' },
  ready: { tone: 'ok', text: 'Running' },
  exited: { tone: 'danger', text: 'The dev server stopped' },
  error: { tone: 'danger', text: 'Could not start' },
  stopped: { tone: 'idle', text: 'Stopped' },
};
