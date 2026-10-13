// Data hook for the Research window. What everyone on the board should see
// lives in window state (win.research), which syncs through Yjs: the last
// search and its results, the knowledge base list (titles, dates, chunk
// counts; never the page text), and the questions asked. Guests render
// that state read-only; their browser never reaches the account routes.

import React from 'react';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { kbSummary, researchApi } from '../../../lib/research/researchApi.js';

const MAX_ASKS = 12;

export function useResearch({ win = {}, onUpdate }) {
  const saved = win.research || {};
  const savedRef = React.useRef(saved);
  savedRef.current = saved;
  const [status, setStatus] = React.useState({ loaded: false, tavily: false, embedding: null });
  const [busy, setBusy] = React.useState(null); // 'search' | 'save' | 'ask' | 'recipe' | null
  const [error, setError] = React.useState('');

  const patch = React.useCallback((next) => {
    const merged = { ...savedRef.current, ...next };
    savedRef.current = merged;
    onUpdate?.({ research: merged });
  }, [onUpdate]);

  const loadStatus = React.useCallback(async () => {
    try {
      const data = await researchApi.status();
      setStatus({ loaded: true, tavily: Boolean(data?.tavily?.configured), embedding: data?.embedding?.label || null });
    } catch {
      setStatus({ loaded: true, tavily: false, embedding: null });
    }
  }, []);

  const refreshKb = React.useCallback(async () => {
    try {
      const { sources } = await researchApi.list();
      const kb = kbSummary(sources);
      // Only write when it changed, so opening a board does not churn the doc.
      if (JSON.stringify(kb) !== JSON.stringify(savedRef.current.kb || [])) patch({ kb, kbAt: new Date().toISOString() });
    } catch {
      // Keep the synced list.
    }
  }, [patch]);

  React.useEffect(() => { loadStatus(); refreshKb(); }, [loadStatus, refreshKb]);

  const run = React.useCallback(async (kind, fn) => {
    setBusy(kind);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const search = React.useCallback((input) => run('search', async () => {
    const data = await researchApi.search(input);
    patch({ search: { ...data, by: getSelf()?.label || null } });
    return data;
  }), [run, patch]);

  const save = React.useCallback((results) => run('save', async () => {
    const data = await researchApi.save({ query: savedRef.current.search?.query || '', results });
    patch({ kb: kbSummary(data.sources), kbAt: new Date().toISOString(), lastSave: { count: data.saved?.length || 0, embedder: data.embedder || null } });
    return data;
  }), [run, patch]);

  const remove = React.useCallback((id) => run('save', async () => {
    const data = await researchApi.remove(id);
    patch({ kb: kbSummary(data.sources), kbAt: new Date().toISOString() });
  }), [run, patch]);

  const ask = React.useCallback((question, meta = {}) => run('ask', async () => {
    const data = await researchApi.ask({ question });
    const entry = {
      id: `ask-${Date.now()}`, question, answer: data.answer, sources: data.sources || [], usedWeb: Boolean(data.usedWeb),
      by: meta.by || getSelf()?.label || null, at: new Date().toISOString(),
    };
    patch({ asks: [entry, ...(savedRef.current.asks || [])].slice(0, MAX_ASKS) });
    return entry;
  }), [run, patch]);

  const runRecipe = React.useCallback((recipe, input) => run('recipe', async () => {
    const data = await researchApi.recipe(recipe, input);
    const { ok, ...out } = data;
    patch({ recipe: { ...out, by: getSelf()?.label || null } });
    if (recipe === 'references' && out.saved) refreshKb();
    return out;
  }), [run, patch, refreshKb]);

  const saveTavilyKey = React.useCallback(async (apiKey) => {
    const res = await fetch('/api/keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'tavily', apiKey }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not save the key');
    await loadStatus();
  }, [loadStatus]);

  return {
    status, busy, error, setError, clearError: () => setError(''),
    lastSearch: saved.search || null,
    kb: Array.isArray(saved.kb) ? saved.kb : [],
    asks: Array.isArray(saved.asks) ? saved.asks : [],
    recipe: saved.recipe || null,
    lastSave: saved.lastSave || null,
    readOnly: !status.loaded,
    search, save, remove, ask, runRecipe, saveTavilyKey, refreshKb,
  };
}
