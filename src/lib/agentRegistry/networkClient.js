// Browser client for the agent network: discovery + help requests.
// Maps 1:1 to server/routes/agentRegistry/network.js.

const BASE_PATH = '/api/agent-registry';

async function readJson(response) {
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.error || `Agent network request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

export function createAgentNetworkClient({ fetch: fetchImpl, workspaceId } = {}) {
  const transport = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!transport) throw new Error('The agent network requires fetch.');
  const scope = String(workspaceId || '').trim();
  if (!scope) throw new Error('workspaceId is required.');
  const ws = `workspaceId=${encodeURIComponent(scope)}`;
  const post = (path, body) => transport(`${BASE_PATH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...body, workspaceId: scope }),
  }).then(readJson);

  return {
    async discoverAgents({ query = '', tags = [], limit = 12 } = {}) {
      const params = new URLSearchParams({ workspaceId: scope, q: String(query || ''), limit: String(limit) });
      if (tags.length) params.set('tags', tags.join(','));
      return readJson(await transport(`${BASE_PATH}/discover?${params}`, { credentials: 'same-origin' }));
    },
    async listHelpRequests() {
      return readJson(await transport(`${BASE_PATH}/help-requests?${ws}`, { credentials: 'same-origin' }));
    },
    requestHelp({ cardId, task, skillId, onBehalfOf } = {}) {
      return post('/help-requests', { cardId, task, skillId: skillId || undefined, onBehalfOf: onBehalfOf || undefined });
    },
    decideHelpRequest(id, decision, note) {
      return post(`/help-requests/${encodeURIComponent(id)}/decision`, { decision, note });
    },
    cancelHelpRequest(id) {
      return post(`/help-requests/${encodeURIComponent(id)}/cancel`, {});
    },
  };
}
