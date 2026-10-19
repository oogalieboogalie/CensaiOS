import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

const BASE = '/api/auction-watcher';
const REFRESH_MS = 60000;

async function call(path, { method = 'GET', body, workspaceId } = {}) {
  const qs = workspaceId ? `${path.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'The Auction Watcher could not do that.'), { code: data.code });
  return data;
}

const warn = (what, err) => logToApp('warn', `auction-watcher: ${what}: ${err.message}`, { where: 'auction-watcher' });

/**
 * Watches, the selected watch's matches and every action in the window.
 * The selected watch is kept on the window so it reopens where it was.
 */
export function useAuctionWatcher({ win = {}, onUpdate }) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const [watches, setWatches] = React.useState(null);
  const [ebayKey, setEbayKey] = React.useState(false);
  const [matches, setMatches] = React.useState([]);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const selectedId = win.auctionWatcher?.selectedId ?? null;
  const selected = watches?.find((w) => w.id === selectedId) || null;
  // Matches that were new when this window first showed them keep their
  // "New" badge while it stays open, even after they are marked seen.
  const newIds = React.useRef(new Set());
  const badge = (m) => {
    if (m.isNew) newIds.current.add(m.id);
    return { ...m, isNew: newIds.current.has(m.id) };
  };

  const select = React.useCallback((id) => {
    onUpdate?.({ auctionWatcher: { ...(win.auctionWatcher || {}), selectedId: id } });
    setNote('');
    setError('');
  }, [onUpdate, win.auctionWatcher]);

  const loadWatches = React.useCallback(async () => {
    try {
      const data = await call('/watches');
      const list = Array.isArray(data.watches) ? data.watches : [];
      setWatches(list);
      setEbayKey(Boolean(data.ebayKey));
      return list;
    } catch (err) {
      setError(err.message);
      warn('could not load watches', err);
      setWatches((w) => w || []);
      return [];
    }
  }, []);

  const loadMatches = React.useCallback(async (id) => {
    if (!id) return setMatches([]);
    try {
      const data = await call(`/watches/${id}/matches`);
      const list = Array.isArray(data.matches) ? data.matches : [];
      setMatches(list.map(badge));
      // Looking at a watch clears its Inbox notices.
      if (list.some((m) => !m.seen)) await call(`/watches/${id}/seen`, { method: 'POST' });
    } catch (err) {
      warn('could not load matches', err);
    }
    return undefined;
  }, []);

  React.useEffect(() => { loadWatches(); }, [loadWatches]);
  React.useEffect(() => { loadMatches(selectedId); }, [selectedId, loadMatches]);
  React.useEffect(() => {
    const t = setInterval(() => { loadWatches(); loadMatches(selectedId); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadWatches, loadMatches, selectedId]);

  const run = React.useCallback(async (label, fn) => {
    setBusy(label);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      warn(label, err);
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const addWatch = (input) => run('adding', async () => {
    const data = await call('/watches', { method: 'POST', body: input });
    logToApp('info', `auction-watcher: watch added for "${data.watch.query}" on ${data.watch.site}`, { where: 'auction-watcher' });
    await loadWatches();
    select(data.watch.id);
    // A problem note shows in the watch's own header; only good news goes here.
    if (!data.check?.note) setNote(`First check found ${data.check?.matches ?? 0} match${data.check?.matches === 1 ? '' : 'es'}. New ones will reach your Inbox.`);
    return data.watch;
  });

  const checkNow = (id) => run('checking', async () => {
    const data = await call(`/watches/${id}/check`, { method: 'POST' });
    setNote(data.check?.note || `Checked: ${data.check?.matches ?? 0} matching, ${data.check?.fresh ?? 0} new.`);
    await loadWatches();
    await loadMatches(id);
  });

  const setStatus = (id, status) => run('saving', async () => {
    await call(`/watches/${id}`, { method: 'PATCH', body: { status } });
    await loadWatches();
  });

  const setInterval_ = (id, intervalMinutes) => run('saving', async () => {
    await call(`/watches/${id}`, { method: 'PATCH', body: { intervalMinutes } });
    await loadWatches();
  });

  const removeWatch = (id) => run('deleting', async () => {
    await call(`/watches/${id}`, { method: 'DELETE' });
    logToApp('info', `auction-watcher: watch ${id} deleted`, { where: 'auction-watcher' });
    select(null);
    await loadWatches();
  });

  const replaceMatch = (match) => setMatches((list) => list.map((m) => (m.id === match.id ? badge(match) : m)));

  const insights = (id) => run(`insights-${id}`, async () => {
    replaceMatch((await call(`/matches/${id}/insights`, { method: 'POST', workspaceId })).match);
  });

  const lastSold = (id) => run(`sold-${id}`, async () => {
    replaceMatch((await call(`/matches/${id}/sold`, { method: 'POST' })).match);
  });

  const saveEbayKey = (appId, certId) => run('saving key', async () => {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'ebay', apiKey: `${appId.trim()}:${certId.trim()}` }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the eBay keys.');
    logToApp('info', 'auction-watcher: eBay keys saved', { where: 'auction-watcher' });
    await loadWatches();
  });

  return {
    watches, selected, matches, ebayKey, busy, error, note,
    select, addWatch, checkNow, setStatus, setInterval: setInterval_, removeWatch, insights, lastSold, saveEbayKey,
  };
}
