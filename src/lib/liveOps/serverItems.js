// Live Operations: what the server knows that is not a window on the board.
// Background agent tasks, scheduled runs, Agent Console coding agents,
// Run dev servers, workflow run history, terminals and Jules sessions.
// Each payload may be missing (cloud mode, no Docker, no workspace): a
// missing one simply adds nothing. Pure.

import { ms, RECENT_MS } from './boardItems.js';
import { plainReason } from './plainReason.js';
import { describeRow, nextRunOf } from '../schedule/fromScheduler.js';

function clip(text, max = 140) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function failed(error) {
  const { plain, raw } = plainReason(error);
  return { state: 'failed', detail: plain, raw };
}

const list = (value) => (Array.isArray(value) ? value : []);

export function taskItems(tasks, { now = Date.now(), agentName = (id) => id } = {}) {
  return list(tasks).map((task) => {
    const at = ms(task.completed_at) || ms(task.updated_at) || ms(task.started_at) || ms(task.created_at);
    const base = { id: `task:${task.id}`, source: 'task', title: clip(task.title, 90) || 'Background task', at, by: agentName(task.assignee_id) };
    if (task.status === 'in_progress') return { ...base, state: 'running', startedAt: ms(task.started_at) || null, detail: `${base.by || 'An agent'} is working on it` };
    if (task.status === 'queued') return { ...base, state: 'running', detail: 'In line to start' };
    if (task.status === 'blocked') return { ...base, state: 'needs_you', detail: clip(task.error) || 'Blocked until someone helps' };
    if (now - at > RECENT_MS) return null;
    if (task.status === 'failed') return { ...base, ...failed(task.error) };
    if (task.status === 'completed') return { ...base, state: 'done', detail: clip(task.result) || 'Finished' };
    if (task.status === 'cancelled') return { ...base, state: 'done', detail: 'Cancelled' };
    return null;
  }).filter(Boolean);
}

export function scheduleItems(schedules, { now = Date.now() } = {}) {
  const out = [];
  for (const s of list(schedules)) {
    const title = clip(s.taskText || s.title, 90) || 'Scheduled run';
    const lastAt = ms(s.lastRunAt);
    if (s.status === 'running') out.push({ id: `schedule:${s.id}:run`, source: 'schedule', title, state: 'running', at: lastAt || now, detail: `${s.agentName || 'An agent'} is running it now` });
    if (s.lastError && now - lastAt < RECENT_MS) out.push({ id: `schedule:${s.id}:err`, source: 'schedule', title, at: lastAt, ...failed(s.lastError) });
    // Same plain words and next run as the Scheduler window (src/lib/schedule).
    const next = s.scheduled_time ? nextRunOf(s, new Date(now))?.getTime() || 0 : ms(s.nextRunAt);
    if (next > now && ['active', 'running'].includes(s.status || 'active')) {
      const how = s.scheduled_time ? describeRow(s, new Date(now)) : 'Runs on its own';
      out.push({ id: `schedule:${s.id}:next`, source: 'schedule', title, state: 'upcoming', at: next, detail: s.agentName ? `${how}, by ${s.agentName}` : how });
    }
  }
  return out;
}

const CLI_STATES = {
  installing: 'running', starting: 'running', running: 'running', needs_approval: 'needs_you',
  failed: 'failed', done: 'done', stopped: 'done',
};

export function cliTaskItems(tasks, { now = Date.now() } = {}) {
  return list(tasks).map((task) => {
    const state = CLI_STATES[task.status];
    if (!state) return null;
    const at = ms(task.finishedAt) || ms(task.updatedAt) || ms(task.createdAt);
    if ((state === 'done' || state === 'failed') && now - at > RECENT_MS) return null;
    const base = {
      id: `cli:${task.id}`, source: 'console', title: clip(task.title, 90) || 'Coding task', at, startedAt: ms(task.createdAt) || null,
      by: task.cliLabel || task.cli, costUsd: Number.isFinite(task.costUsd) ? task.costUsd : null,
    };
    if (state === 'needs_you') return { ...base, state, detail: `${base.by} is waiting for someone to allow a step` };
    if (state === 'failed') return { ...base, ...failed(task.lastError || `${base.by} stopped with an error.`) };
    if (state === 'running') return { ...base, state, detail: `${base.by} is working on it` };
    return { ...base, state, detail: task.status === 'stopped' ? 'Stopped' : clip(task.summary) || 'Finished' };
  }).filter(Boolean);
}

export function devServerItems(servers) {
  return list(servers).map((s) => {
    const folder = String(s.folder || '').split(/[\\/]/).filter(Boolean).pop() || s.name;
    const base = { id: `dev:${s.name}`, source: 'dev', title: `${folder} dev server`, at: 0, link: s.url || null };
    if (s.state === 'running') return { ...base, state: 'running', detail: s.url ? `Up at ${s.url.replace(/^https?:\/\//, '')}` : 'Up' };
    if (s.state === 'exited' || s.state === 'dead') return { ...base, ...failed(`The dev server stopped (${s.status || 'exited'}). Open Run dev to see its last lines.`) };
    return null;
  }).filter(Boolean);
}

/** Server run history. Runs a board window already shows are skipped. */
export function workflowRunItems(runs, { titleFor = () => null, seenRunIds = new Set() } = {}) {
  return list(runs).filter((r) => !seenRunIds.has(r.id)).map((run) => {
    const base = {
      id: `workflow:${run.id}`, runId: run.id, source: 'workflow', windowId: run.windowId,
      title: titleFor(run.windowId) || 'Workflow', at: ms(run.finishedAt) || ms(run.startedAt), startedAt: ms(run.startedAt) || null,
      by: run.startedBy || (run.trigger === 'schedule' ? 'its schedule' : null), trigger: run.trigger,
    };
    if (run.status === 'running') return { ...base, state: 'running', detail: 'Running' };
    if (run.status === 'awaiting_review') return { ...base, state: 'needs_you', detail: 'Waiting for a person to review a step' };
    if (run.status === 'failed') return { ...base, ...failed(run.error) };
    return { ...base, state: 'done', detail: run.status === 'stopped' ? 'Stopped by a person' : 'Every step finished' };
  });
}

export function workflowTriggerItems(triggers, { titleFor = () => null, now = Date.now() } = {}) {
  return list(triggers).map((t) => {
    const title = titleFor(t.windowId) || 'Workflow';
    if (t.mode === 'board') {
      return { id: `wft:${t.windowId}`, source: 'workflow', windowId: t.windowId, title, state: 'upcoming', at: Number.MAX_SAFE_INTEGER, detail: 'Starts when a matching window lands on the board' };
    }
    const next = ms(t.nextRunAt);
    if (!next) return null;
    return { id: `wft:${t.windowId}`, source: 'workflow', windowId: t.windowId, title, state: 'upcoming', at: Math.max(next, now), detail: t.everyMinutes ? `Runs every ${everyText(t.everyMinutes)}` : 'Runs on a schedule' };
  }).filter(Boolean);
}

export function everyText(minutes) {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'day' : `${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? 'hour' : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

const TYPED_RECENTLY_MS = 5 * 60 * 1000;
const OUTPUT_RECENTLY_MS = 60 * 1000;

/**
 * Terminals someone is really using: typed in lately, or a coding CLI still
 * printing after someone gave it work. A terminal a teammate merely has on
 * screen is not counted.
 */
export function terminalItems(terminals, { now = Date.now() } = {}) {
  return list(terminals).map((t) => {
    const typed = ms(t.lastInputAt);
    const active = t.busy || (typed && now - typed < TYPED_RECENTLY_MS)
      || (t.cli && typed && now - ms(t.lastActivityAt) < OUTPUT_RECENTLY_MS);
    if (!active) return null;
    return {
      id: `term:${t.id}:${t.ownerUserId ?? ''}`, source: 'terminal', title: `${t.label || 'Terminal'}${t.owner ? ` (${t.owner})` : ''}`,
      state: 'running', at: Math.max(typed, ms(t.lastActivityAt)), startedAt: ms(t.createdAt) || null, by: t.owner || null,
      detail: t.cli ? `${t.label} is at work` : 'Someone is typing in it',
    };
  }).filter(Boolean);
}

const JULES_RUNNING = new Set(['QUEUED', 'PLANNING', 'IN_PROGRESS']);
const JULES_WAITING = new Set(['AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK']);

export function julesItems(sessions) {
  return list(sessions).map((s) => {
    const base = { id: `jules:${s.id}`, source: 'jules', title: clip(s.title, 90) || 'Jules task', at: ms(s.lastPolledAt), link: s.julesUrl || null };
    if (JULES_RUNNING.has(s.status)) return { ...base, state: 'running', detail: 'Jules is working on it' };
    if (JULES_WAITING.has(s.status)) return { ...base, state: 'needs_you', detail: s.status === 'AWAITING_PLAN_APPROVAL' ? 'Jules wants its plan approved' : 'Jules asked a question' };
    if (s.status === 'FAILED') return { ...base, ...failed('Jules could not finish this task.') };
    return null;
  }).filter(Boolean);
}
