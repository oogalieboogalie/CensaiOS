import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Merge desk state for the GitHub window.
 *
 * What everyone on the board should see lives on the window itself, so it
 * syncs through the board's Yjs doc like any other window field:
 *   win.prDesk      { repo, prs, recent, fetchedAt }   last fetched snapshot
 *   win.prActivity  { [number]: { state, by, text, jobId, taskId, approvals, at } }
 * A merge or fix started by anyone shows on every screen. Each client
 * refreshes from GitHub with its own token; only successes are written.
 * A fix's waiting requests go on the board in a teammate's words; this
 * computer's owner also gets them whole (`whole`, by job), kept on this
 * screen only and never written to the window.
 */

const REFRESH_MS = 45_000;
const FIX_POLL_MS = 2000;
const IN_FLIGHT = new Set(['merging', 'fixing']);

async function readJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || fallback), { status: res.status });
  return data;
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function useMergeDesk(win, onUpdate, repo) {
  const [connection, setConnection] = useState({ checked: false, connected: false, me: 'You' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bulk, setBulk] = useState(null); // { done, total } while "Merge all green" runs
  const [whole, setWholeByJob] = useState({}); // { [jobId]: requests } in the owner's whole words
  const latest = useRef(win);
  latest.current = win;

  const setWhole = useCallback((jobId, list) => {
    setWholeByJob((current) => {
      if (!Array.isArray(list)) {
        if (!(jobId in current)) return current;
        const { [jobId]: _gone, ...rest } = current;
        return rest;
      }
      return JSON.stringify(current[jobId]) === JSON.stringify(list) ? current : { ...current, [jobId]: list };
    });
  }, []);

  const desk = win.prDesk?.repo === repo ? win.prDesk : null;
  const activity = win.prActivity || {};

  const setActivity = useCallback((number, entry) => {
    const current = latest.current.prActivity || {};
    const next = { ...current };
    if (entry) next[number] = { ...entry, at: Date.now() };
    else delete next[number];
    latest.current = { ...latest.current, prActivity: next };
    onUpdate?.({ prActivity: next });
  }, [onUpdate]);

  const writeDesk = useCallback((nextDesk) => {
    latest.current = { ...latest.current, prDesk: nextDesk };
    onUpdate?.({ prDesk: nextDesk });
  }, [onUpdate]);

  const checkConnection = useCallback(async () => {
    try {
      const data = await readJson(await fetch('/api/github/desk/status'), 'Could not reach Homebase');
      setConnection({ checked: true, connected: Boolean(data.connected), me: data.me || 'You' });
      return Boolean(data.connected);
    } catch {
      setConnection((c) => ({ ...c, checked: true }));
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!repo) return;
    setLoading(true);
    try {
      const data = await readJson(await fetch(`/api/github/desk?repo=${encodeURIComponent(repo)}`), 'Could not load pull requests');
      writeDesk(data);
      setError('');
      // Drop "Merged" notes for PRs that left the open list a while ago.
      const acts = latest.current.prActivity || {};
      const open = new Set(data.prs.map((p) => String(p.number)));
      const stale = Object.keys(acts).filter((n) => !open.has(n) && !IN_FLIGHT.has(acts[n].state) && Date.now() - acts[n].at > 60_000);
      if (stale.length) {
        const next = { ...acts };
        for (const n of stale) delete next[n];
        latest.current = { ...latest.current, prActivity: next };
        onUpdate?.({ prActivity: next });
      }
    } catch (err) {
      if (err.status === 401) setConnection((c) => ({ ...c, connected: false }));
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repo, writeDesk, onUpdate]);

  const saveToken = useCallback(async (token) => {
    await readJson(await post('/api/keys', { provider: 'github', apiKey: token }), 'Could not save the token');
    if (await checkConnection()) await refresh();
  }, [checkConnection, refresh]);

  const merge = useCallback(async (number) => {
    setActivity(number, { state: 'merging', by: connection.me, text: 'Merging…' });
    try {
      const result = await readJson(await post('/api/github/desk/merge', { repo, number }), 'Merge failed');
      const current = latest.current.prDesk;
      if (current?.repo === repo) {
        const pr = current.prs.find((p) => p.number === number);
        writeDesk({
          ...current,
          prs: current.prs.filter((p) => p.number !== number),
          recent: [{ number, title: pr?.title || `#${number}`, url: pr?.url, author: pr?.author, mergedAt: result.mergedAt, mergedBy: result.by }, ...current.recent.filter((r) => r.number !== number)].slice(0, 8),
        });
      }
      setActivity(number, { state: 'merged', by: result.by, text: result.markedReady ? 'Marked ready and merged' : 'Merged' });
      return true;
    } catch (err) {
      setActivity(number, { state: 'error', by: connection.me, text: err.message });
      return false;
    }
  }, [repo, connection.me, setActivity, writeDesk]);

  const mergeAllGreen = useCallback(async () => {
    const green = (latest.current.prDesk?.prs || []).filter((p) => p.green && !IN_FLIGHT.has(activity[p.number]?.state));
    setBulk({ done: 0, total: green.length });
    for (let i = 0; i < green.length; i++) {
      await merge(green[i].number);
      setBulk({ done: i + 1, total: green.length });
    }
    setBulk(null);
    await refresh();
  }, [activity, merge, refresh]);

  const fixConflicts = useCallback(async (number) => {
    setActivity(number, { state: 'fixing', by: connection.me, text: 'Starting…' });
    try {
      const { job } = await readJson(await post('/api/github/desk/fix', { repo, number }), 'Could not start the fix');
      setActivity(number, { state: job.status === 'done' ? 'fixed' : job.status === 'failed' ? 'error' : 'fixing', by: job.by, text: job.text, jobId: job.id, taskId: job.taskId || null });
      if (job.status === 'done') refresh();
    } catch (err) {
      setActivity(number, { state: 'error', by: connection.me, text: err.message });
    }
  }, [repo, connection.me, setActivity, refresh]);

  const answerApproval = useCallback(async (number, approvalId, allow) => {
    const entry = latest.current.prActivity?.[number];
    if (!entry?.jobId) return;
    try {
      await readJson(await post(`/api/github/desk/fix/${entry.jobId}/approve`, { approvalId, allow }), 'Could not send the answer');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  // Refresh when the window opens on a stale snapshot, then every 45s while visible.
  useEffect(() => {
    if (!repo || !connection.connected) return undefined;
    const age = desk?.fetchedAt ? Date.now() - Date.parse(desk.fetchedAt) : Infinity;
    if (age > 15_000) refresh();
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [repo, connection.connected]);

  // Follow running fixes (any viewer can; the job lives on the server).
  const fixing = Object.entries(activity).filter(([, a]) => a.state === 'fixing' && a.jobId);
  const fixingKey = fixing.map(([n, a]) => `${n}:${a.jobId}`).join(',');
  useEffect(() => {
    if (!fixingKey) return undefined;
    const timer = setInterval(async () => {
      for (const [number, entry] of Object.entries(latest.current.prActivity || {})) {
        if (entry.state !== 'fixing' || !entry.jobId) continue;
        try {
          const { job, approvals, whole: wholeAsks } = await readJson(await fetch(`/api/github/desk/fix/${entry.jobId}`), 'lost');
          const state = job.status === 'done' ? 'fixed' : job.status === 'failed' ? 'error' : 'fixing';
          const taskId = job.taskId || null;
          const same = entry.state === state && entry.text === job.text && (entry.taskId || null) === taskId
            && JSON.stringify(entry.approvals || []) === JSON.stringify(approvals);
          // Only `approvals` (a teammate's words) are written to the board.
          if (!same) setActivity(Number(number), { ...entry, state, text: job.text, taskId, approvals, agentSummary: job.agentSummary || null });
          setWhole(entry.jobId, state === 'fixing' ? wholeAsks : null);
          if (state === 'fixed') refresh();
        } catch (err) {
          if (err.status === 404) {
            setWhole(entry.jobId, null);
            setActivity(Number(number), { ...entry, state: 'error', text: err.message });
          }
        }
      }
    }, FIX_POLL_MS);
    return () => clearInterval(timer);
  }, [fixingKey, setActivity, setWhole, refresh]);

  return {
    connection, desk, activity, whole, loading, error, bulk,
    refresh, saveToken, merge, mergeAllGreen, fixConflicts, answerApproval,
    dismiss: (number) => setActivity(number, null),
  };
}
