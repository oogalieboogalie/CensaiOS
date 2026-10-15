// Live Operations feed: one list of everything happening on the board, in
// plain words, sorted so what needs a person comes first. Pure.

import { boardItems, RECENT_MS } from './boardItems.js';
import {
  cliTaskItems, devServerItems, julesItems, scheduleItems, taskItems,
  terminalItems, workflowRunItems, workflowTriggerItems,
} from './serverItems.js';

export const STATES = Object.freeze(['needs_you', 'failed', 'running', 'upcoming', 'done']);

export const STATE_LABELS = Object.freeze({
  needs_you: 'Needs you', failed: 'Failed', running: 'Running now', upcoming: 'Coming up', done: 'Finished',
});

export const SOURCE_LABELS = Object.freeze({
  chat: 'Chat agent', console: 'Agent Console', workflow: 'Workflow', arena: 'Model arena',
  module: 'Module', leads: 'LeadHound', help: 'Agent help', task: 'Background task',
  schedule: 'Schedule', dev: 'Run dev', terminal: 'Terminal', jules: 'Jules',
});

const ORDER = Object.fromEntries(STATES.map((s, i) => [s, i]));

function compare(a, b) {
  if (a.state !== b.state) return ORDER[a.state] - ORDER[b.state];
  if (a.state === 'upcoming') return a.at - b.at;
  return b.at - a.at;
}

/** Start of today in local time, for "spent today". */
export function startOfDay(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * @param {object} input
 * @param {Array} input.wins        canvas windows
 * @param {object} input.server     { tasks, schedules, cliTasks, devServers, liveOps, jules }
 *                                  (cliTasks null = the Agent Console list is not available here)
 * @param {Function} input.agentName  sub-agent id -> name
 */
export function buildFeed({ wins = [], server = {}, agentName = (id) => id, now = Date.now() } = {}) {
  const titles = new Map((Array.isArray(wins) ? wins : []).map((w) => [w?.id, w?.title]));
  const titleFor = (id) => titles.get(id) || null;
  const consoleFromServer = Array.isArray(server.cliTasks);
  const fromBoard = boardItems(wins, { now, consoleFromServer });
  const seenRunIds = new Set(fromBoard.map((i) => i.runId).filter(Boolean));
  const live = server.liveOps || {};

  const all = [
    ...fromBoard,
    ...taskItems(server.tasks, { now, agentName }),
    ...scheduleItems(server.schedules, { now }),
    ...cliTaskItems(server.cliTasks, { now }),
    ...devServerItems(server.devServers),
    ...workflowRunItems(live.workflowRuns, { titleFor, seenRunIds }),
    ...workflowTriggerItems(live.workflowTriggers, { titleFor, now }),
    ...terminalItems(live.terminals, { now }),
    ...julesItems(server.jules),
  ];
  const seen = new Set();
  const items = all
    .filter((item) => item && !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({ ...item, sourceLabel: SOURCE_LABELS[item.source] || 'Activity' }))
    .sort(compare);

  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const item of items) counts[item.state] += 1;

  const today = startOfDay(now);
  let usd = 0;
  let priced = 0;
  for (const item of items) {
    if (Number.isFinite(item.costUsd) && item.at >= today) { usd += item.costUsd; priced += 1; }
  }
  const finishedToday = items.filter((i) => i.state === 'done' && i.at >= today).length;
  return { items, counts, finishedToday, spentToday: { usd, priced }, recentMs: RECENT_MS };
}

/** "$0.042", "free", or "$1.20". */
export function money(usd) {
  if (!Number.isFinite(usd)) return '';
  if (usd === 0) return 'free';
  if (usd < 0.01) return `$${usd.toFixed(4).replace(/0+$/, '')}`;
  return `$${usd.toFixed(2)}`;
}

/** "just now", "4 min ago", "in 2 h", "3 h ago". */
export function when(at, now = Date.now()) {
  if (!at || at === Number.MAX_SAFE_INTEGER) return '';
  const diff = at - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const text = abs < 45 * 1000 ? null : min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`;
  if (!text) return diff > 0 ? 'any moment' : 'just now';
  return diff > 0 ? `in ${text}` : `${text} ago`;
}
