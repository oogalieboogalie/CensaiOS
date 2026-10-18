// Browser client for the Research routes (server/routes/agents/research.js).
// Every call names the board, so the knowledge base is the board's own.

import { useWorkspaceStore } from '../store.js';

function withBoard(path, workspaceId) {
  const id = workspaceId ?? useWorkspaceStore.getState().workspaceId;
  return id ? `${path}${path.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(id)}` : path;
}

async function call(path, { method = 'GET', body, workspaceId, signal } = {}) {
  const res = await fetch(withBoard(`/api/research${path}`, workspaceId), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { code: data?.code, status: res.status });
  return data;
}

export const researchApi = {
  status: () => call('/status'),
  search: (input) => call('/search', { method: 'POST', body: input }),
  save: ({ query, results }) => call('/kb/save', { method: 'POST', body: { query, results } }),
  list: () => call('/kb'),
  saveFile: ({ name, text }) => call('/kb/file', { method: 'POST', body: { name, text } }),
  chunks: (id) => call(`/kb/${encodeURIComponent(id)}/chunks`),
  remove: (id) => call(`/kb/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  query: ({ query, k = 6, asPrompt = false, workspaceId } = {}) => call('/kb/query', { method: 'POST', body: { query, k, asPrompt }, workspaceId }),
  ask: ({ question, web = true, workspaceId } = {}) => call('/ask', { method: 'POST', body: { question, web }, workspaceId }),
  recipe: (recipe, input) => call('/recipe', { method: 'POST', body: { recipe, input } }),
  fill: ({ value, prompt, row, signal } = {}) => call('/fill', { method: 'POST', body: { value, prompt, row }, signal }),
};

/** The slim, syncable picture of a knowledge base source (no text, no vectors). */
export function kbSummary(sources = []) {
  return (Array.isArray(sources) ? sources : []).slice(0, 200).map((s) => ({
    id: s.id, url: s.url || null, title: s.title, query: s.query || null,
    publishedAt: s.publishedAt || null, savedAt: s.savedAt || null, chunkCount: s.chunkCount || 0,
    tags: Array.isArray(s.tags) ? s.tags.slice(0, 6) : [], kind: s.kind || null,
  }));
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function shortDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
