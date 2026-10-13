const BASE = '/api/tool-packages';

async function readJson(response, fallback) {
  let body = null;
  try { body = await response.json(); } catch { /* normalized below */ }
  if (!response.ok) {
    const error = new Error(body?.error || fallback);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

export function createToolPackageClient({ fetch: fetchImpl = fetch, workspaceId }) {
  const scope = String(workspaceId || '').trim();
  if (!scope) throw new Error('Open a workspace before loading add-ons.');
  const query = `workspaceId=${encodeURIComponent(scope)}`;
  return {
    async listToolPackages() {
      return readJson(await fetchImpl(`${BASE}?${query}`, { credentials: 'same-origin' }),
        'Add-ons could not be loaded.');
    },
    async installToolPackage(packageId) {
      return readJson(await fetchImpl(`${BASE}/${encodeURIComponent(packageId)}/install`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ workspaceId: scope }),
      }), 'The add-on was not installed.');
    },
    async removeToolPackage(packageId) {
      return readJson(await fetchImpl(`${BASE}/${encodeURIComponent(packageId)}/install`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ workspaceId: scope }),
      }), 'The add-on was not removed.');
    },
  };
}
