/** App update API calls (server/routes/appUpdate.js). */

async function call(url, { method = 'GET', headers } = {}) {
  const post = method === 'POST';
  const res = await fetch(url, {
    method,
    headers: post ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: post ? '{}' : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Update request failed (${res.status})`), { status: res.status, code: typeof data?.code === 'string' ? data.code : undefined, ownerName: data?.ownerName, yourName: data?.yourName });
  return data;
}

export const appUpdateApi = {
  status: () => call('/api/app-update'),
  restart: () => call('/api/app-update/restart', { method: 'POST' }),
  check: () => call('/api/app-update/check', { method: 'POST' }),
  start: () => call('/api/app-update/start', { method: 'POST' }),
  inFlight: () => call('/api/app-update/in-flight'),
  activity: () => call('/api/app-update/activity', { method: 'POST', headers: { 'X-Censai-Client': '1' } }),
};

/** "3 fixes" / "1 fix" for the note; null when the updater listed none. */
export function changeCount(changes) {
  const n = Array.isArray(changes) ? changes.length : 0;
  if (!n) return null;
  return n === 1 ? '1 change' : `${n} changes`;
}
