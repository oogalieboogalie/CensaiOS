// "Share my AI keys with": the client side of server/routes/keySharing.js.

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/key-sharing${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not reach censaiOS (${res.status}).`);
  return data;
}

export const getKeySharing = () => call('');
export const saveKeySharing = (userId, shared) => call(`/${encodeURIComponent(userId)}`, { method: 'PUT', body: { shared } });
