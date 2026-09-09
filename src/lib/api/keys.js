/**
 * API methods for managing user-provided API keys (BYOK).
 */

export async function getUserKeys() {
  const res = await fetch('/api/keys');
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch keys');
  return data;
}

export async function setUserKey(provider, apiKey, _baseUrl = null, modelName = null) {
  const res = await fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, modelName })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to save key');
  }
  return await res.json();
}

export async function deleteUserKey(provider) {
  const res = await fetch(`/api/keys/${encodeURIComponent(provider)}`, {
    method: 'DELETE'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to delete key');
  return data;
}
