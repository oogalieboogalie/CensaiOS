// Browser client for the AI resources window (server/routes/aiResources.js).

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/ai-resources${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const aiResourcesApi = {
  load: () => call('/'),
  setBudget: (keyId, budgetUsd) => call('/budget', { method: 'PUT', body: { keyId, budgetUsd } }),
  askProvider: (keyId) => call('/ask-provider', { method: 'POST', body: { keyId } }),
};
