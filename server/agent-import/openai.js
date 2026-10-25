// Pull Assistants straight from the person's OpenAI account with their own
// vault key (diagram 18: import external agents). Read-only: nothing
// is changed on OpenAI. Each Assistant object already has the shape the
// file importer reads (name, instructions, model, tools).

import { AccountImportError } from './elevenlabs.js';

export const OPENAI_BASE_URL = process.env.OPENAI_IMPORT_BASE_URL || 'https://api.openai.com';
const MAX_AGENTS = 20;

/** The account's Assistants, newest first, at most 20. */
export async function listOpenAiAssistants({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new AccountImportError('Add your OpenAI key in Settings → Vault first.', 403);
  const res = await fetchImpl(`${OPENAI_BASE_URL}/v1/assistants?limit=${MAX_AGENTS}&order=desc`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'OpenAI-Beta': 'assistants=v2', Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    throw new AccountImportError('OpenAI refused the key. Check it in Settings → Vault, and that it can read Assistants.', 401);
  }
  if (!res.ok) throw new AccountImportError(`OpenAI answered ${res.status}.`);
  const body = await res.json();
  return (Array.isArray(body?.data) ? body.data : [])
    .filter((item) => item && typeof item === 'object' && item.object === 'assistant')
    .slice(0, MAX_AGENTS);
}
