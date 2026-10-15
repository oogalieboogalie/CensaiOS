import React from 'react';
import { cliAgentsApi } from '../../agentConsole/cliAgentsApi.js';

/**
 * "Have an agent fix it" for Inbox items, shared with everyone on the board
 * through the window field win.inboxActivity:
 *   { "<item id>": { state: 'fixing'|'fixed'|'error', text, by, jobId, taskId, approvals, at } }
 * Red checks go to /api/inbox/fix-ci, conflicts to the GitHub window's
 * /api/github/desk/fix, error reports to their own source. Every PR fix job
 * is followed at /api/github/desk/fix/:id by whoever has the window open.
 */

const POLL_MS = 2000;

async function readJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || fallback), { status: res.status });
  return data;
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const jobState = (job) => (job.status === 'done' ? 'fixed' : job.status === 'failed' ? 'error' : 'fixing');

export function fixActionFor(item) {
  return (item?.actions || []).find((a) => a === 'fix_ci' || a === 'fix_conflicts' || a === 'fix_error') || null;
}

export function useInboxFixes(win, onUpdate, { me, refresh }) {
  const latest = React.useRef(win);
  latest.current = win;
  const activity = win.inboxActivity || {};

  const setActivity = React.useCallback((id, entry) => {
    const next = { ...(latest.current.inboxActivity || {}) };
    if (entry) next[id] = { ...entry, at: Date.now() };
    else delete next[id];
    latest.current = { ...latest.current, inboxActivity: next };
    onUpdate?.({ inboxActivity: next });
  }, [onUpdate]);

  const fix = React.useCallback(async (item) => {
    const action = fixActionFor(item);
    if (!action) return;
    setActivity(item.id, { state: 'fixing', by: me, text: 'Starting an agent…' });
    try {
      if (action === 'fix_error') {
        const result = await readJson(await post('/api/inbox/fix-error', { source: item.source, reportId: item.reportId }), 'Could not start the fix');
        setActivity(item.id, { state: 'fixing', by: me, text: result.text || 'Handed to an agent.' });
        return;
      }
      const url = action === 'fix_ci' ? '/api/inbox/fix-ci' : '/api/github/desk/fix';
      const { job } = await readJson(await post(url, { repo: item.repo, number: item.number }), 'Could not start the fix');
      setActivity(item.id, { state: jobState(job), by: job.by || me, text: job.text, jobId: job.id, taskId: job.taskId || null });
      if (job.status === 'done') refresh?.();
    } catch (err) {
      setActivity(item.id, { state: 'error', by: me, text: err.message });
    }
  }, [me, setActivity, refresh]);

  /** Allow or deny a pending agent question (an agent task, or the agent behind a fix). */
  const answer = React.useCallback(async (taskId, approvalId, allow) => {
    await cliAgentsApi.decide(taskId, approvalId, allow);
    refresh?.();
  }, [refresh]);

  // Follow running fix jobs; the job lives on the server, so any viewer can.
  const runningKey = Object.entries(activity).filter(([, a]) => a.state === 'fixing' && a.jobId).map(([id, a]) => `${id}:${a.jobId}`).join(',');
  React.useEffect(() => {
    if (!runningKey) return undefined;
    const timer = setInterval(async () => {
      for (const [id, entry] of Object.entries(latest.current.inboxActivity || {})) {
        if (entry.state !== 'fixing' || !entry.jobId) continue;
        try {
          const { job, approvals } = await readJson(await fetch(`/api/github/desk/fix/${entry.jobId}`), 'lost');
          const state = jobState(job);
          const same = entry.state === state && entry.text === job.text && entry.taskId === (job.taskId || null)
            && JSON.stringify(entry.approvals || []) === JSON.stringify(approvals || []);
          if (!same) setActivity(id, { ...entry, state, text: job.text, taskId: job.taskId || null, approvals, agentSummary: job.agentSummary || null });
          if (state !== 'fixing') refresh?.();
        } catch (err) {
          if (err.status === 404) setActivity(id, { ...entry, state: 'error', text: err.message });
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [runningKey, setActivity, refresh]);

  return { activity, fix, answer, dismiss: (id) => setActivity(id, null) };
}
