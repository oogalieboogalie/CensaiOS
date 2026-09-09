const A2A_IMPORT_PATH = '/api/agent-registry/imports/a2a';
const N8N_IMPORT_PATH = '/api/agent-registry/imports/n8n-chat';

async function sendImport(fetchImpl, path, body, label) {
  const res = await fetchImpl(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${label} import failed (HTTP ${res.status})`);
  return data;
}

export function createA2AImportClient({ fetch: fetchImpl = globalThis.fetch, workspaceId } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A2A import client requires fetch.');
  const scope = String(workspaceId || '').trim();
  return {
    async importA2A(cardUrl) {
      if (!scope) throw new Error('Open a workspace before importing an agent.');
      return sendImport(fetchImpl, A2A_IMPORT_PATH, { workspaceId: scope, cardUrl }, 'A2A');
    },
    async importN8NChat({ webhookUrl, name, description }) {
      if (!scope) throw new Error('Open a workspace before importing an agent.');
      return sendImport(fetchImpl, N8N_IMPORT_PATH, {
        workspaceId: scope, webhookUrl, name, description,
      }, 'n8n');
    },
  };
}
