// The Agent list: every agent this board knows, like a friends list. Each
// row gets a presence badge, a "what it is doing" line with how long, and
// where it runs. Built only from real activity: the shared run record a
// chat window keeps (agentRun), the Agent Console status, module builds,
// lead hunts and help cards (all synced through the board), plus what the
// server knows (last chat, background tasks, agents added from elsewhere).
// Pure: no store, no fetch.

import { listBoardAgents } from '../agentNetwork/boardAgents.js';
import { ACTIVE_HELP_STATUSES, HELP_CARD_KIND, agentActivity } from '../weewoo/office.js';
import { chatHost, networkHost, windowHost } from './hosts.js';

const MIN = 60 * 1000;
const ONLINE_AFTER_CHAT_MS = 10 * MIN; // a chat this recent counts as online even with no window open
const NETWORK_ONLINE_MS = 10 * MIN;
const ERROR_SHOWS_MS = 30 * MIN;
const STALE_RUN_MS = 10 * MIN; // same as the WeeWoo office: an older "thinking" was abandoned

export const PRESENCE_LABEL = {
  busy: 'Working', waiting: 'Needs you', online: 'Online', away: 'Away', problem: 'Had a problem', remote: 'On another computer', offline: 'Offline',
};

// Groups in the order the list shows them, like a friends list.
export const GROUPS = [
  { id: 'busy', label: 'Working now', has: ['busy', 'waiting', 'problem'] },
  { id: 'online', label: 'Online', has: ['online'] },
  { id: 'away', label: 'Away', has: ['away'] },
  { id: 'remote', label: 'On other computers', has: ['remote'] },
  { id: 'offline', label: 'Offline', has: ['offline'] },
];

const RANK = { busy: 0, waiting: 1, problem: 2, online: 3, away: 4, remote: 5, offline: 6 };

function ms(value) {
  if (Number.isFinite(value)) return value;
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : 0;
}

/** "3m", "2h", "4d" since a time; empty when unknown. */
export function elapsed(since, now = Date.now()) {
  const at = ms(since);
  if (!at) return '';
  const mins = Math.max(0, Math.floor((now - at) / MIN));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / (24 * 60))}d`;
}

// What one board window is doing, in friends-list words.
function windowPresence(win, cards, now) {
  const act = agentActivity(win, cards, now);
  const run = win.agentRun && typeof win.agentRun === 'object' ? win.agentRun : null;
  const helping = cards.find((c) => c.toWindowId === win.id && ACTIVE_HELP_STATUSES.has(c.status));
  if (act.status === 'working') {
    const runLive = run && (run.state === 'thinking' || run.state === 'tool') && now - ms(run.at) < STALE_RUN_MS;
    if (runLive) {
      const doing = run.state === 'tool' ? `Using ${run.tool || 'a tool'}` : (run.by ? `Chatting with ${run.by}` : 'Thinking');
      return { status: 'busy', line: doing, since: ms(run.startedAt) || ms(run.at) };
    }
    if (helping) return { status: 'busy', line: `Helping ${helping.fromLabel || 'a teammate'}`, since: ms(helping.createdAt) };
    if (win.kind === 'agentConsole') return { status: 'busy', line: act.task ? `Coding: ${act.task}` : 'Coding', since: ms(win.cliStatusAt) };
    return { status: 'busy', line: act.task || 'Working', since: ms(win.leadHound?.startedAt) || act.lastAt };
  }
  if (act.status === 'waiting') {
    const line = win.kind === 'agentConsole' ? 'Waiting for a person to allow a step' : act.task || 'Waiting';
    return { status: 'waiting', line, since: act.lastAt };
  }
  if (act.status === 'error') return { status: 'problem', line: 'Its last run failed', since: act.lastAt };
  if (act.status === 'napping') return { status: 'away', line: 'Idle', since: act.lastAt };
  if (run?.state === 'done' && act.lastAt) return { status: 'online', line: 'Answered', since: act.lastAt };
  return { status: 'online', line: 'On the board', since: null };
}

const better = (a, b) => (!a || RANK[b.status] < RANK[a.status] ? b : a);

function familyRow(agent, { chatWins, cards, chat, tasks, now }) {
  const base = {
    key: `agent:${agent.id}`, type: 'agent', name: agent.name || agent.id, role: agent.role || '', agent,
    agentId: agent.id, windowId: chatWins[0]?.id || null, host: chatHost(agent), onBoard: chatWins.length > 0,
  };
  let best = null;
  for (const win of chatWins) {
    const p = { ...windowPresence(win, cards, now), windowId: win.id };
    best = better(best, p);
  }
  const running = tasks.find((t) => t.status === 'in_progress');
  const blocked = tasks.find((t) => t.status === 'blocked');
  const queued = tasks.filter((t) => t.status === 'queued').length;
  if ((!best || RANK[best.status] > RANK.busy) && running) {
    best = { status: 'busy', line: `${running.helper || 'A helper'} is on: ${running.title}`, since: ms(running.startedAt) || ms(running.at) };
  } else if ((!best || RANK[best.status] > RANK.waiting) && blocked) {
    best = { status: 'waiting', line: `Stuck on: ${blocked.title}`, since: ms(blocked.at) };
  }
  const chatAt = ms(chat?.at);
  if (!best && chatAt && now - chatAt < ONLINE_AFTER_CHAT_MS) {
    best = { status: 'online', line: chat.withName ? `Chatted with ${chat.withName}` : 'Chatted', since: chatAt };
  }
  if (!best) {
    const line = chatAt ? `Last chat ${elapsed(chatAt, now)} ago${chat.withName ? ` with ${chat.withName}` : ''}` : 'Not on this board';
    best = { status: 'offline', line, since: null };
  }
  if (queued && best.status !== 'busy') best = { ...best, line: `${best.line} · ${queued} task${queued === 1 ? '' : 's'} in line` };
  return { ...base, ...best, windowId: best.windowId || base.windowId, lastChatAt: chatAt || null };
}

function networkRow(card, now) {
  const req = card.lastRequest;
  const at = ms(req?.at);
  const base = { key: `card:${card.cardId}`, type: 'network', name: card.name, role: '', cardId: card.cardId, host: networkHost(card.source), onBoard: false, windowId: null };
  if (req?.status === 'working' || req?.status === 'queued') return { ...base, status: 'busy', line: `Answering: ${req.task}`, since: at };
  if (req?.status === 'pending') return { ...base, status: 'waiting', line: 'Waiting for its owner to say yes', since: at };
  if (req?.status === 'waiting') return { ...base, status: 'away', line: 'Its computer is off; your question waits for it', since: at };
  if (req?.status === 'failed' && now - at < ERROR_SHOWS_MS) return { ...base, status: 'problem', line: 'Could not answer the last question', since: at };
  if (req?.status === 'completed' && now - at < NETWORK_ONLINE_MS) return { ...base, status: 'online', line: 'Answered', since: at };
  return { ...base, status: 'remote', line: at ? `Last asked ${elapsed(at, now)} ago` : 'Answers when its computer is on', since: null };
}

/**
 * @param {{ wins?: Array, agents?: Array, server?: object|null, now?: number }} input
 *   agents: agent records (family + saved); server: GET /api/live-ops/workspaces/:id/agents
 * @returns {{ rows: Array, groups: Array<{id,label,rows}>, counts: object }}
 */
export function buildAgentList({ wins = [], agents = [], server = null, now = Date.now() } = {}) {
  const list = Array.isArray(wins) ? wins : [];
  const cards = list.filter((w) => w?.kind === HELP_CARD_KIND);
  const chats = new Map((server?.chats || []).map((c) => [c.agentId, c]));
  const tasksBy = new Map();
  for (const t of server?.tasks || []) tasksBy.set(t.agentId, [...(tasksBy.get(t.agentId) || []), t]);
  const byId = new Map(agents.map((a) => [a.id, a]));
  const rows = [];

  const seen = new Set();
  for (const agent of agents) {
    if (!agent?.id || seen.has(agent.id)) continue;
    seen.add(agent.id);
    const chatWins = list.filter((w) => (w?.kind === 'chat' || w?.kind === 'agent') && w.agentId === agent.id);
    rows.push(familyRow(agent, { chatWins, cards, chat: chats.get(agent.id), tasks: tasksBy.get(agent.id) || [], now }));
  }
  // Chat windows for an agent the store does not know yet still show up.
  for (const win of list) {
    if ((win?.kind === 'chat' || win?.kind === 'agent') && win.agentId && !seen.has(win.agentId)) {
      seen.add(win.agentId);
      const agent = byId.get(win.agentId) || { id: win.agentId, name: win.title || win.agentId };
      const chatWins = list.filter((w) => (w?.kind === 'chat' || w?.kind === 'agent') && w.agentId === win.agentId);
      rows.push(familyRow(agent, { chatWins, cards, chat: chats.get(win.agentId), tasks: tasksBy.get(win.agentId) || [], now }));
    }
  }
  const byWin = new Map(list.map((w) => [w?.id, w]));
  for (const entry of listBoardAgents(list)) {
    if (entry.executor === 'network') continue;
    const win = byWin.get(entry.windowId) || {};
    rows.push({
      key: `win:${entry.windowId}`, type: 'window', name: entry.name, role: entry.role, kind: entry.kind,
      windowId: entry.windowId, host: windowHost(entry.kind), onBoard: true, ...windowPresence(win, cards, now),
    });
  }
  for (const card of server?.network || []) rows.push(networkRow(card, now));

  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || String(a.name).localeCompare(String(b.name)));
  const groups = GROUPS.map((g) => ({ id: g.id, label: g.label, rows: rows.filter((r) => g.has.includes(r.status)) }));
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, groups.find((x) => x.id === g.id).rows.length]));
  return { rows, groups, counts };
}

/** Rows whose name, job, doing line or host match the search words. */
export function filterAgentRows(rows, query = '') {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const text = `${r.name} ${r.role} ${r.line} ${r.host?.label || ''} ${PRESENCE_LABEL[r.status]}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
