const BASE_PATH = '/api/agent-registry/installs';

function fetchTransport(fetchImpl) {
  const transport = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!transport) throw new Error('AgentCard installs require fetch.');
  return transport;
}

async function readJson(response) {
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.error || `AgentCard install request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function installMap(items) {
  const entries = (items || []).map(item => [item.card_id, Object.freeze({
    installedAt: item.installed_at,
    installedByUserId: item.installed_by_user_id,
  })]);
  return Object.freeze(Object.fromEntries(entries));
}

export function createAgentCardInstallClient({ fetch: fetchImpl, workspaceId } = {}) {
  const transport = fetchTransport(fetchImpl);
  const scope = required(workspaceId, 'workspaceId');
  const query = `workspaceId=${encodeURIComponent(scope)}`;
  return {
    async listInstalled() {
      const body = await readJson(await transport(`${BASE_PATH}?${query}`, { credentials: 'same-origin' }));
      return { installed: installMap(body?.items), canManage: Boolean(body?.canManage) };
    },
    async installCard(cardId) {
      const id = required(cardId, 'cardId');
      const body = await readJson(await transport(`${BASE_PATH}/${encodeURIComponent(id)}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: scope }),
      }));
      return body;
    },
    async uninstallCard(cardId) {
      const id = required(cardId, 'cardId');
      return readJson(await transport(`${BASE_PATH}/${encodeURIComponent(id)}?${query}`, {
        method: 'DELETE', credentials: 'same-origin',
      }));
    },
  };
}
