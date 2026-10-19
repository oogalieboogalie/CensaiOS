// Browser client for the API Bar (server/routes/apiBar.js): the menu, one
// note sent through the doorman, bar keys and the knock log.

import { useWorkspaceStore } from '../store.js';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/bar${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function must(path, options) {
  const out = await call(path, options);
  if (!out.ok) throw Object.assign(new Error(out.data?.error || `Request failed (${out.status})`), { status: out.status });
  return out.data;
}

/** Parse the note box. Returns { note } or { error } in plain words. */
export function readNote(text) {
  let note;
  try {
    note = JSON.parse(text || '{}');
  } catch {
    return { error: 'The note is not valid JSON. Check for a missing quote or comma.' };
  }
  if (!note || typeof note !== 'object' || Array.isArray(note)) return { error: 'The note must be one JSON object, like { "api_bar": { ... } }.' };
  if (!note.api_bar?.branch || !note.api_bar?.action) return { error: 'Put "branch" and "action" inside "api_bar".' };
  return { note };
}

/** The example note for an action, as pretty JSON for the note box. */
export function exampleNote(action) {
  return JSON.stringify(action?.example || { api_bar: { branch: '', action: '' } }, null, 2);
}

/** A copy-and-run example for a key: the same note from a terminal. */
export function curlExample(token, origin = globalThis.location?.origin || 'http://localhost:3002') {
  const note = JSON.stringify({ api_bar: { branch: 'leads', action: 'saved', paginate: true } });
  return `curl -X POST ${origin}/api/bar -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${note}'`;
}

export const apiBarApi = {
  menu: () => must(''),
  send: (method, note) => {
    const workspaceId = useWorkspaceStore.getState().workspaceId;
    const withBoard = workspaceId && !note.workspaceId ? { ...note, workspaceId } : note;
    if (method === 'GET') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...withBoard.api_bar, ...withBoard })) {
        if (k !== 'api_bar' && v !== '' && v !== undefined && v !== null && typeof v !== 'object') params.set(k, String(v));
      }
      return call(`?${params.toString()}`);
    }
    return call('', { method, body: withBoard });
  },
  keys: () => must('/keys'),
  makeKey: (input) => must('/keys', { method: 'POST', body: input }),
  revokeKey: (id) => must(`/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  log: () => must('/log'),
};
