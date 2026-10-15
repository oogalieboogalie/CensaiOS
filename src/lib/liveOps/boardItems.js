// Live Operations: what the windows on the board are doing. Everything here
// is read from the canvas windows, which sync through the board's Yjs doc,
// so every teammate sees the same thing the moment it changes. Pure.

import { estimateCost } from '../modelArena/arenaCatalog.js';
import { ACTIVE_HELP_STATUSES, HELP_CARD_KIND, windowAgentLabel } from '../../../server/agent-registry/helpCardShape.js';
import { plainReason } from './plainReason.js';

const MIN = 60 * 1000;
const STALE_RUN_MS = 10 * MIN; // a "thinking" record older than this was abandoned
const STALE_RACE_MS = 15 * MIN;
export const RECENT_MS = 24 * 60 * MIN;

export function ms(value) {
  if (Number.isFinite(value)) return value;
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : 0;
}

function clip(text, max = 140) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function failed(error) {
  const { plain, raw } = plainReason(error);
  return { state: 'failed', detail: plain, raw };
}

function chatRunItem(win, now) {
  const run = win.agentRun;
  if (!run || typeof run !== 'object') return null;
  const name = windowAgentLabel(win, 'Agent');
  const base = { id: `chat:${win.id}`, source: 'chat', windowId: win.id, title: name, at: ms(run.at), startedAt: ms(run.startedAt) || null };
  const live = (run.state === 'thinking' || run.state === 'tool') && now - ms(run.at) < STALE_RUN_MS;
  if (live) {
    const doing = run.state === 'tool' ? `Using ${run.tool || 'a tool'}` : 'Thinking';
    return { ...base, state: 'running', detail: run.task ? `${doing}: ${clip(run.task)}` : doing };
  }
  if (now - ms(run.at) > RECENT_MS) return null;
  const last = Array.isArray(run.log) ? run.log[run.log.length - 1] : null;
  if (run.state === 'error') return { ...base, ...failed(last?.text) };
  if (run.state === 'done') return { ...base, state: 'done', detail: run.task ? clip(run.task) : 'Answered' };
  if (run.state === 'stopped') return { ...base, state: 'done', detail: 'Stopped by a person' };
  return null;
}

const CLI_STATES = {
  installing: 'running', starting: 'running', running: 'running', needs_approval: 'needs_you',
  failed: 'failed', done: 'done', completed: 'done', stopped: 'done',
};

function consoleItem(win, now) {
  const state = CLI_STATES[win.cliStatus];
  if (!state) return null;
  const at = ms(win.cliStatusAt);
  if (state !== 'running' && state !== 'needs_you' && now - at > RECENT_MS) return null;
  const base = { id: `console:${win.id}`, source: 'console', windowId: win.id, title: win.cliTask ? clip(win.cliTask, 90) : (win.title || 'Agent Console'), at };
  if (state === 'needs_you') return { ...base, state, detail: 'Waiting for a person to allow a step' };
  if (state === 'failed') return { ...base, ...failed(win.cliError || 'The coding agent stopped with an error.') };
  return { ...base, state, detail: state === 'running' ? 'Working in its own copy of the code' : 'Finished' };
}

function workflowItem(win) {
  const run = win.run;
  if (!run || typeof run !== 'object' || !run.status) return null;
  const nodes = Array.isArray(win.graph?.nodes) ? win.graph.nodes : [];
  const stepTitle = (status) => {
    const node = nodes.find((n) => run.nodes?.[n.id]?.status === status);
    return node?.title || null;
  };
  const base = {
    id: `workflow:${run.id || win.id}`, runId: run.id || null, source: 'workflow', windowId: win.id,
    title: win.title || 'Workflow', at: ms(run.finishedAt) || ms(run.startedAt), startedAt: ms(run.startedAt) || null,
    trigger: run.trigger || null,
  };
  if (run.status === 'running') {
    const step = stepTitle('running');
    return { ...base, state: 'running', detail: step ? `On step: ${step}` : 'Running' };
  }
  if (run.status === 'awaiting_review') {
    const step = stepTitle('waiting');
    return { ...base, state: 'needs_you', detail: step ? `Waiting for a person to review "${step}"` : 'Waiting for a person to review a step' };
  }
  if (run.status === 'failed') return { ...base, ...failed(run.error) };
  if (run.status === 'stopped') return { ...base, state: 'done', detail: 'Stopped by a person' };
  if (run.status === 'complete') return { ...base, state: 'done', detail: 'Every step finished' };
  return null;
}

/** Cost of one arena race: the sum of the lanes with a price on file. */
export function raceCost(lastRun) {
  const lanes = Array.isArray(lastRun?.lanes) ? lastRun.lanes : [];
  const results = Array.isArray(lastRun?.results) ? lastRun.results : [];
  let total = null;
  lanes.forEach((lane, i) => {
    const cost = estimateCost(lane?.provider, lane?.model, results[i]?.usage);
    if (Number.isFinite(cost)) total = (total || 0) + cost;
  });
  return total;
}

function arenaItem(win, now) {
  const base = { id: `arena:${win.id}`, source: 'arena', windowId: win.id, title: win.title || 'Model arena' };
  if (win.racing && now - ms(win.racing.at) < STALE_RACE_MS) {
    return { ...base, state: 'running', at: ms(win.racing.at), startedAt: ms(win.racing.at), detail: `Racing ${win.racing.lanes || 'several'} models` };
  }
  const last = win.lastRun;
  if (!last || now - ms(last.at) > RECENT_MS) return null;
  const results = Array.isArray(last.results) ? last.results : [];
  const errors = results.filter((r) => r?.status === 'error');
  const at = ms(last.at);
  const costUsd = raceCost(last);
  if (results.length && errors.length === results.length) return { ...base, at, costUsd, ...failed(errors[0]?.error?.message || errors[0]?.error) };
  const done = results.filter((r) => r?.status === 'done').length;
  const detail = errors.length ? `${done} of ${results.length} models answered; ${errors.length} failed` : `${done} models answered`;
  return { ...base, state: 'done', at, costUsd, detail, ...(errors.length ? { warn: plainReason(errors[0]?.error?.message || errors[0]?.error).plain } : {}) };
}

function moduleItem(win, now) {
  if (win.status === 'building') return { id: `module:${win.id}`, source: 'module', windowId: win.id, title: win.title || 'Module', state: 'running', at: now, detail: 'Building itself' };
  if (win.status === 'error' || win.status === 'failed') {
    return { id: `module:${win.id}`, source: 'module', windowId: win.id, title: win.title || 'Module', at: ms(win.updatedAt) || now, ...failed(win.error || 'The build failed.') };
  }
  return null;
}

function leadItem(win, now) {
  if (!win.leadHound?.hunting) return null;
  return { id: `leads:${win.id}`, source: 'leads', windowId: win.id, title: win.title || 'LeadHound', state: 'running', at: ms(win.leadHound.startedAt) || now, detail: 'Hunting for leads' };
}

function helpItem(card, now) {
  const status = String(card.status || '');
  const at = ms(card.updatedAt) || ms(card.createdAt);
  const base = {
    id: `help:${card.id}`, source: 'help', windowId: card.id, at,
    title: `${card.fromLabel || 'Someone'} asked ${card.toLabel || 'an agent'}`,
  };
  if (status === 'needs approval') return { ...base, state: 'needs_you', detail: 'Waiting for a person to allow it' };
  if (ACTIVE_HELP_STATUSES.has(status)) return { ...base, state: 'running', detail: clip(card.task) || 'Working on it' };
  if (now - at > RECENT_MS) return null;
  if (status === 'failed') return { ...base, ...failed(card.error) };
  if (status === 'completed' || status === 'done' || status === 'answered') return { ...base, state: 'done', detail: clip(card.task) || 'Answered' };
  return null;
}

/**
 * Every item the board's own windows can tell us about.
 * @param {Array} wins every canvas window
 * @param {{ now?: number, consoleFromServer?: boolean }} opts
 *   consoleFromServer: the Agent Console list came from the server, so its
 *   board windows are not counted twice.
 */
export function boardItems(wins, { now = Date.now(), consoleFromServer = false } = {}) {
  const out = [];
  for (const win of Array.isArray(wins) ? wins : []) {
    if (!win || typeof win !== 'object') continue;
    const found = win.kind === HELP_CARD_KIND ? helpItem(win, now)
      : win.kind === 'workflow' ? workflowItem(win)
        : win.kind === 'modelArena' ? arenaItem(win, now)
          : win.kind === 'agentConsole' ? (consoleFromServer ? null : consoleItem(win, now))
            : win.kind === 'module' ? moduleItem(win, now)
              : win.leadHound ? leadItem(win, now)
                : chatRunItem(win, now);
    if (found) out.push(found);
  }
  return out;
}
