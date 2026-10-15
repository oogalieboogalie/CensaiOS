import React from 'react';
import { useWorkspaceStore } from '../../../lib/store.js';
import { useVisibilityAwareInterval } from '../../../lib/usePolling.js';
import { errorItem } from '../../../lib/inbox/errorItem.js';
import { boardErrorReports, onBoardErrors } from '../../../lib/inbox/boardErrors.js';

/**
 * The Inbox's data. The server sends pull requests, agent tasks and error
 * reports; this browser adds the errors it caught itself. What everyone on
 * the board should agree on lives on the window and syncs through Yjs:
 *   win.inboxRepo   which GitHub repo to watch
 *   win.inboxAcks   { "<item id>|<state>": { by, at } }  acknowledged items
 * An acknowledged item comes back on its own when its state changes
 * (a fixed PR that goes red again is new news).
 */

const REFRESH_MS = 45_000;
const BUSY_REFRESH_MS = 10_000;
const UNDO_MS = 7000;
const GROUP_ORDER = { needs: 0, working: 1, ready: 2, done: 3 };

export const ackKey = (item) => `${item.id}|${item.state}`;

async function readJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || fallback), { status: res.status });
  return data;
}

/** The repo to watch: this window's pick, else the board's GitHub window, else the project's. */
export function defaultRepo(win, wins = [], currentProject = null) {
  if (win?.inboxRepo) return win.inboxRepo;
  const gh = wins.find((w) => w.kind === 'githubConsole' && (w.state?.repo || w.prDesk?.repo));
  return gh?.state?.repo || gh?.prDesk?.repo || currentProject?.repo || '';
}

export function mergeItems(serverItems = [], localReports = []) {
  const local = localReports.map(errorItem);
  return [...serverItems, ...local].sort((a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || (Date.parse(b.at || 0) - Date.parse(a.at || 0)));
}

export function useInbox(win, onUpdate, currentProject) {
  const wins = useWorkspaceStore((s) => s.wins);
  const repo = defaultRepo(win, wins, currentProject);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [boardTick, setBoardTick] = React.useState(0);
  const [undo, setUndo] = React.useState(null); // { key, title }
  const [me, setMe] = React.useState('You');
  const latest = React.useRef(win);
  latest.current = win;
  const acks = win.inboxAcks || {};

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const next = await readJson(await fetch(`/api/inbox${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`), 'Could not load the inbox');
      setData(next);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  React.useEffect(() => { refresh(); }, [refresh]);
  React.useEffect(() => onBoardErrors(() => setBoardTick((n) => n + 1)), []);
  React.useEffect(() => {
    fetch('/api/github/desk/status').then((r) => r.json()).then((d) => d?.me && setMe(d.me)).catch(() => {});
  }, []);

  const busy = (data?.items || []).some((i) => i.group === 'working');
  useVisibilityAwareInterval(refresh, busy ? BUSY_REFRESH_MS : REFRESH_MS);

  const all = React.useMemo(
    () => mergeItems(data?.items, data?.serverErrors ? [] : boardErrorReports()),
    // boardTick re-reads this browser's errors when a new one lands.
    [data, boardTick],
  );
  const items = all.filter((i) => !acks[ackKey(i)]);
  const acknowledged = all.filter((i) => acks[ackKey(i)]);

  const writeAcks = React.useCallback((next) => {
    latest.current = { ...latest.current, inboxAcks: next };
    onUpdate?.({ inboxAcks: next });
  }, [onUpdate]);

  const acknowledge = React.useCallback((item) => {
    if (!item) return;
    const key = ackKey(item);
    const current = latest.current.inboxAcks || {};
    // Keep the list small: drop acks older than two weeks.
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const kept = Object.fromEntries(Object.entries(current).filter(([, v]) => (v?.at || 0) > cutoff));
    writeAcks({ ...kept, [key]: { by: me, at: Date.now() } });
    setUndo({ key, title: item.title });
  }, [me, writeAcks]);

  const undoAck = React.useCallback(() => {
    if (!undo) return false;
    const next = { ...(latest.current.inboxAcks || {}) };
    delete next[undo.key];
    writeAcks(next);
    setUndo(null);
    return true;
  }, [undo, writeAcks]);

  React.useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const setRepo = React.useCallback((value) => onUpdate?.({ inboxRepo: String(value || '').trim() }), [onUpdate]);

  return {
    repo, setRepo, data, items, acknowledged, acks, error, loading, refresh,
    acknowledge, undo, undoAck, me,
  };
}
