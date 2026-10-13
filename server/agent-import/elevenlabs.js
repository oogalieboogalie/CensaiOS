// Pull conversational agents straight from the person's ElevenLabs account
// with their own vault key. Read-only: nothing is changed on ElevenLabs.

export const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
const MAX_AGENTS = 20;

export class AccountImportError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AccountImportError';
    this.status = status;
  }
}

async function getJson(fetchImpl, url, apiKey) {
  const res = await fetchImpl(url, { headers: { 'xi-api-key': apiKey, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) {
    throw new AccountImportError('ElevenLabs refused the key. Check it in Settings → Vault, and that it can read agents.', 401);
  }
  if (!res.ok) throw new AccountImportError(`ElevenLabs answered ${res.status}.`);
  return res.json();
}

/** Full definitions of the account's agents (newest first, at most 20). */
export async function listElevenLabsAgents({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new AccountImportError('Add your ElevenLabs key in Settings → Vault first.', 403);
  const list = await getJson(fetchImpl, `${ELEVENLABS_BASE_URL}/v1/convai/agents?page_size=${MAX_AGENTS}`, apiKey);
  const ids = (Array.isArray(list?.agents) ? list.agents : [])
    .map(agent => agent?.agent_id)
    .filter(id => typeof id === 'string' && /^[\w-]{1,80}$/.test(id))
    .slice(0, MAX_AGENTS);
  const out = [];
  for (const id of ids) {
    out.push(await getJson(fetchImpl, `${ELEVENLABS_BASE_URL}/v1/convai/agents/${encodeURIComponent(id)}`, apiKey));
  }
  return out;
}
