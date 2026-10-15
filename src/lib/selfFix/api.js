/** Self-fix API calls (server/routes/selfFix.js). */

async function call(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Self-fix request failed (${res.status})`), { status: res.status });
  return data;
}

export const selfFixApi = {
  load: () => call('/api/self-fix'),
  notices: () => call('/api/self-fix/notices'),
  seen: (id, status) => call(`/api/self-fix/notices/${encodeURIComponent(id)}/seen`, { method: 'POST', body: { status } }),
  settings: (patch) => call('/api/self-fix/settings', { method: 'POST', body: patch }),
  fix: (id) => call(`/api/self-fix/reports/${encodeURIComponent(id)}/fix`, { method: 'POST', body: {} }),
  undo: (id) => call(`/api/self-fix/reports/${encodeURIComponent(id)}/undo`, { method: 'POST', body: {} }),
};

/** Plain words for each report status. */
export const STATUS_WORDS = {
  saved: 'Saved',
  fixing: 'Fixing now',
  ready: 'Fixed, applies next start',
  applied: 'Fixed',
  failed: 'Could not fix',
  undone: 'Undone',
  landed: 'Fixed by an update',
};
