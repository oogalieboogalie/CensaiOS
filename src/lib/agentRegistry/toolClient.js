const agentPath = agentId => `/api/agents/${encodeURIComponent(agentId)}/tool-registry`;

async function readJson(response) {
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.error || `Tool registry failed (HTTP ${response.status}).`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function createFamilyToolRegistryClient({
  fetch: fetchImpl = globalThis.fetch,
  workspaceId,
} = {}) {
  const scope = String(workspaceId || '').trim();
  if (!fetchImpl) throw new Error('Tool registry requires fetch.');
  if (!scope) throw new Error('Tool registry requires a workspace.');

  return {
    async listTools(agentId) {
      const id = String(agentId || '').trim();
      if (!id) throw new Error('Tool registry requires an agent.');
      const query = new URLSearchParams({ workspaceId: scope });
      const response = await fetchImpl(`${agentPath(id)}?${query}`, {
        credentials: 'same-origin',
      });
      return readJson(response);
    },
  };
}
