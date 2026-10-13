// HTTP client for /api/cli-agents (server/routes/cliAgents.js).

const BASE = '/api/cli-agents';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  }
  return data;
}

export const cliAgentsApi = {
  roster: (refresh = false) => request(`/roster${refresh ? '?refresh=1' : ''}`),
  install: (cli) => request(`/install/${encodeURIComponent(cli)}`, { method: 'POST' }),
  folders: () => request('/folders'),
  tasks: () => request('/tasks'),
  start: (body) => request('/tasks', { method: 'POST', body }),
  task: (id, since = 0) => request(`/tasks/${encodeURIComponent(id)}?since=${since}`),
  raw: (id) => request(`/tasks/${encodeURIComponent(id)}/raw`),
  changes: (id) => request(`/tasks/${encodeURIComponent(id)}/changes`),
  file: (id, path) => request(`/tasks/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`),
  message: (id, prompt) => request(`/tasks/${encodeURIComponent(id)}/message`, { method: 'POST', body: { prompt } }),
  stop: (id) => request(`/tasks/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  handoff: (id, cli, instruction) => request(`/tasks/${encodeURIComponent(id)}/handoff`, { method: 'POST', body: { cli, instruction } }),
  decide: (id, permissionId, allow) => request(`/tasks/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissionId)}`, { method: 'POST', body: { allow } }),
  discard: (id) => request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  permissions: () => request('/permissions'),
  saveKey: (provider, apiKey) => fetch('/api/keys', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey }),
  }).then(async (res) => {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the key.');
    return true;
  }),
};

/** Which key-vault provider holds each CLI's key (Settings → keys). */
export const VAULT_PROVIDER = { claudecode: 'anthropic', codex: 'openai', gemini: 'google', opencode: 'opencode' };
