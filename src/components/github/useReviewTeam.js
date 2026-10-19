import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Review team state for the GitHub window: per PR, which coding CLIs to send,
 * the running review, its approvals and merged findings. Kept on this screen
 * only; the posted GitHub review is what everyone else sees.
 */

const POLL_MS = 2500;
const DEFAULT_PICK = ['claudecode', 'grok', 'codex', 'gemini'];

async function readJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || fallback);
  return data;
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

/** Ready reviewers first; pick up to two ready ones by default. */
export function defaultPicks(reviewers) {
  const ready = reviewers.filter((r) => r.ready).map((r) => r.id);
  return DEFAULT_PICK.filter((id) => ready.includes(id)).concat(ready.filter((id) => !DEFAULT_PICK.includes(id))).slice(0, 2);
}

export function useReviewTeam(repo) {
  const [roster, setRoster] = useState({ checked: false, available: false, reviewers: [] });
  const [byPr, setByPr] = useState({});
  const latest = useRef(byPr);
  latest.current = byPr;

  const patch = useCallback((number, next) => {
    setByPr((all) => ({ ...all, [number]: { ...(all[number] || {}), ...next } }));
  }, []);

  useEffect(() => {
    let live = true;
    fetch('/api/github/desk/reviewers').then((r) => readJson(r, 'Could not list reviewers'))
      .then((data) => { if (live) setRoster({ checked: true, available: Boolean(data.available), reviewers: data.reviewers || [] }); })
      .catch(() => { if (live) setRoster({ checked: true, available: false, reviewers: [] }); });
    return () => { live = false; };
  }, []);

  useEffect(() => { setByPr({}); }, [repo]);

  const toggle = useCallback((number) => {
    const cur = latest.current[number];
    patch(number, { open: !cur?.open, picked: cur?.picked || defaultPicks(roster.reviewers) });
  }, [patch, roster.reviewers]);

  const pick = useCallback((number, id) => {
    const picked = latest.current[number]?.picked || [];
    patch(number, { picked: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });
  }, [patch]);

  const start = useCallback(async (number) => {
    patch(number, { busy: true, error: '' });
    try {
      const data = await readJson(await post('/api/github/desk/review', { repo, number, reviewers: latest.current[number]?.picked || [] }), 'Could not start the review');
      patch(number, { busy: false, job: data.review, approvals: [] });
    } catch (err) {
      patch(number, { busy: false, error: err.message });
    }
  }, [patch, repo]);

  const refresh = useCallback(async (number) => {
    const job = latest.current[number]?.job;
    if (!job) return;
    try {
      const data = await readJson(await fetch(`/api/github/desk/review/${job.id}`), 'Lost track of the review');
      patch(number, { job: data.review, approvals: data.approvals || [] });
    } catch (err) {
      patch(number, { error: err.message, job: { ...job, status: 'failed', text: err.message } });
    }
  }, [patch]);

  useEffect(() => {
    const running = Object.entries(byPr).filter(([, s]) => s.job?.status === 'reviewing').map(([n]) => Number(n));
    if (!running.length) return undefined;
    const timer = setInterval(() => running.forEach((n) => refresh(n)), POLL_MS);
    return () => clearInterval(timer);
  }, [byPr, refresh]);

  const approve = useCallback(async (number, approval, allow) => {
    const job = latest.current[number]?.job;
    if (!job) return;
    try {
      await readJson(await post(`/api/github/desk/review/${job.id}/approve`, { taskId: approval.taskId, approvalId: approval.id, allow }), 'Could not send that answer');
      refresh(number);
    } catch (err) {
      patch(number, { error: err.message });
    }
  }, [patch, refresh]);

  const postToGithub = useCallback(async (number) => {
    const job = latest.current[number]?.job;
    if (!job) return;
    patch(number, { busy: true, error: '' });
    try {
      const data = await readJson(await post(`/api/github/desk/review/${job.id}/post`), 'Could not post the review');
      patch(number, { busy: false, job: data.review });
    } catch (err) {
      patch(number, { busy: false, error: err.message });
    }
  }, [patch]);

  return { roster, byPr, toggle, pick, start, approve, postToGithub };
}
