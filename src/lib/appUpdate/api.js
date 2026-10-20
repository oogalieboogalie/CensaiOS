/** App update API calls (server/routes/appUpdate.js). */

async function call(url, { method = 'GET' } = {}) {
  const res = await fetch(url, { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? '{}' : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Update request failed (${res.status})`), { status: res.status, ownerName: data?.ownerName, yourName: data?.yourName });
  return data;
}

export const appUpdateApi = {
  status: () => call('/api/app-update'),
  restart: () => call('/api/app-update/restart', { method: 'POST' }),
  check: () => call('/api/app-update/check', { method: 'POST' }),
  inFlight: () => call('/api/app-update/in-flight'),
};

/** "3 fixes" / "1 fix" for the note; null when the updater listed none. */
export function changeCount(changes) {
  const n = Array.isArray(changes) ? changes.length : 0;
  if (!n) return null;
  return n === 1 ? '1 change' : `${n} changes`;
}
