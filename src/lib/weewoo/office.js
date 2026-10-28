// WeeWoo office: the board's real agents as avatars in a company's
// departments. Built from the canvas windows (synced through Yjs) so every
// teammate sees the same floor. Each agent's status, mood and energy come
// from what it is really doing: a chat agent's shared run record, an Agent
// Console task, a module build, a lead hunt, and the help requests agents
// send each other. Pure: no store, no fetch.

import { listBoardAgents } from '../agentNetwork/boardAgents.js';
import { ACTIVE_HELP_STATUSES, HELP_CARD_KIND } from '../../../server/agent-registry/helpCardShape.js';
import { defaultAvatar, normalizeAvatar } from './avatarParts.js';
import { LOBBY_ID, listDepartments, listSeats } from './company.js';

// The Agent list reads help cards the same way, through this file.
export { ACTIVE_HELP_STATUSES, HELP_CARD_KIND };

const MIN = 60 * 1000;
const STALE_RUN_MS = 10 * MIN; // a "thinking" record older than this was abandoned
const ERROR_SHOWS_MS = 30 * MIN;
const NAP_AFTER_MS = 20 * MIN;
const HOUR = 60 * MIN;

const ROLE_RULES = [
  ['engineering', /code|coding|backend|front.?end|engineer|database|infra|container|devops|bug|develop|ui\b|ux|design|build/i],
  ['research', /research|editor|writ|analy|scholar|read|knowledge|study|teach/i],
  ['growth', /business|strateg|sales|market|lead|growth|outreach|prospect/i],
  ['people', /people|hr\b|psycholog|coach|onboard|support|care|community/i],
  ['ops', /orchestr|operation|schedul|project|manag|assistant|inbox|module/i],
];

/** Which starter department an agent belongs in, from what it is. */
export function roleDepartment(agent) {
  if (agent.kind === 'agentConsole') return 'engineering';
  if (agent.kind === 'research') return 'research';
  if (agent.kind === 'leadHound') return 'growth';
  if (agent.kind === 'module') return 'ops';
  const text = `${agent.role || ''} ${agent.name || ''}`;
  for (const [dept, rule] of ROLE_RULES) if (rule.test(text)) return dept;
  return LOBBY_ID;
}

const CLI_STATE = {
  installing: 'working', starting: 'working', running: 'working', needs_approval: 'waiting',
  failed: 'error', stopped: 'idle', done: 'idle', completed: 'idle',
};

function ms(value) {
  if (Number.isFinite(value)) return value;
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : 0;
}

/** What one agent window is doing right now. */
export function agentActivity(win, cards = [], now = Date.now()) {
  const run = win.agentRun && typeof win.agentRun === 'object' ? win.agentRun : null;
  const incoming = cards.filter((c) => c.toWindowId === win.id);
  const outgoing = cards.filter((c) => c.fromWindowId === win.id);
  const helping = incoming.find((c) => ACTIVE_HELP_STATUSES.has(c.status));
  const approval = incoming.find((c) => c.status === 'needs approval');
  const asking = outgoing.find((c) => ACTIVE_HELP_STATUSES.has(c.status) || c.status === 'needs approval');
  const log = Array.isArray(run?.log) ? run.log.filter((e) => e && Number.isFinite(e.at)) : [];
  let lastAt = Math.max(ms(run?.at), ...cards.filter((c) => c.toWindowId === win.id || c.fromWindowId === win.id).map((c) => ms(c.updatedAt)), 0);

  let status = 'idle';
  let task = null;
  let tool = null;
  const runLive = run && (run.state === 'thinking' || run.state === 'tool') && now - ms(run.at) < STALE_RUN_MS;
  if (runLive) {
    status = 'working'; task = run.task || null; tool = run.state === 'tool' ? run.tool : null;
  } else if (win.kind === 'agentConsole' && CLI_STATE[win.cliStatus]) {
    status = CLI_STATE[win.cliStatus];
    task = win.cliTask || null;
    lastAt = Math.max(lastAt, ms(win.cliStatusAt));
  } else if (win.kind === 'module' && win.status === 'building') {
    status = 'working'; task = 'Building itself';
  } else if (win.kind === 'module' && (win.status === 'error' || win.status === 'failed')) {
    status = 'error'; task = win.error || 'Build failed';
  } else if (win.leadHound?.hunting) {
    status = 'working'; task = 'Hunting for leads';
  }
  if (status !== 'working' && status !== 'waiting' && helping) { status = 'working'; task = helping.task; }
  if (status !== 'working' && approval) { status = 'waiting'; task = 'Waiting for a person to allow a step'; }
  if (status === 'idle' && asking) { status = 'waiting'; task = `Waiting on ${asking.toLabel}`; }
  if (status === 'idle' && run?.state === 'error' && now - ms(run.at) < ERROR_SHOWS_MS) { status = 'error'; task = log[log.length - 1]?.text || 'Its last run failed'; }
  if (status === 'idle' && lastAt && now - lastAt > NAP_AFTER_MS) status = 'napping';

  const recent = log.filter((e) => now - e.at < HOUR);
  const runs = recent.filter((e) => e.kind === 'start').length + incoming.filter((c) => now - ms(c.createdAt) < HOUR).length;
  const errors = recent.filter((e) => e.kind === 'error').length + incoming.filter((c) => c.status === 'failed' && now - ms(c.updatedAt) < HOUR).length;
  let energy = 1 - runs * 0.12 - errors * 0.2 - (status === 'working' ? 0.08 : 0);
  energy = Math.round(Math.max(0.05, Math.min(1, energy)) * 100) / 100;

  const justFinished = run?.state === 'done' && now - ms(run.at) < 10 * MIN;
  let mood = 'calm';
  if (status === 'error') mood = 'flustered';
  else if (status === 'waiting') mood = 'patient';
  else if (status === 'working') {
    if (helping && !runLive) mood = 'helpful';
    else if (tool) mood = 'focused';
    else if (runLive && now - ms(run.startedAt) > 2 * MIN) mood = 'determined';
    else mood = 'thoughtful';
  } else if (status === 'napping') mood = 'sleepy';
  else if (justFinished) mood = 'cheerful';
  else if (energy < 0.35) mood = 'tired';

  return { status, task, tool, mood, energy, lastAt: lastAt || null, runsLastHour: runs, errorsLastHour: errors, log };
}

/**
 * The company floor.
 * @param {object} company  the WeeWoo window (departments and seats)
 * @param {Array} wins      every canvas window
 * @param {{ agentFor?: Function, now?: number }} opts
 */
export function buildOffice(company, wins, { agentFor = () => null, now = Date.now() } = {}) {
  const list = Array.isArray(wins) ? wins : [];
  const byId = new Map(list.map((w) => [w.id, w]));
  const cards = list.filter((w) => w?.kind === HELP_CARD_KIND);
  const departments = listDepartments(company);
  const deptIds = new Set(departments.map((d) => d.id));
  const seats = listSeats(company);

  const agents = listBoardAgents(list, { agentFor }).map((entry) => {
    const win = byId.get(entry.windowId) || {};
    const roleDept = roleDepartment(entry);
    const seated = seats[entry.windowId];
    const deptId = seated && deptIds.has(seated) ? seated : (deptIds.has(roleDept) ? roleDept : LOBBY_ID);
    const fallback = defaultAvatar(`${win.agentId || entry.windowId}`, roleDept);
    const avatar = normalizeAvatar(win.avatar, fallback) || fallback;
    return {
      ...entry,
      agentId: win.agentId || null,
      deptId,
      seatedBy: seated && deptIds.has(seated) ? 'person' : 'auto',
      avatar,
      avatarBy: win.avatar ? (win.avatar.by || 'person') : 'default',
      ...agentActivity(win, cards, now),
    };
  });

  const rooms = departments.map((dept) => ({ ...dept, agents: agents.filter((a) => a.deptId === dept.id) }));
  const threads = cards
    .filter((c) => c.fromWindowId || c.toWindowId)
    .map((c) => ({
      id: c.id, from: c.fromWindowId, to: c.toWindowId, fromLabel: c.fromLabel, toLabel: c.toLabel,
      task: c.task, result: c.result, error: c.error, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt,
    }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const working = agents.filter((a) => a.status === 'working').length;
  return { name: company?.title || 'My company', rooms, agents, threads, working };
}

/** One feed of what happened on the floor, newest first. */
export function officeFeed(office, limit = 8) {
  const rows = [];
  for (const agent of office.agents) {
    for (const e of agent.log) {
      const verb = e.kind === 'start' ? 'picked up' : e.kind === 'tool' ? 'used' : e.kind === 'error' ? 'hit an error:' : e.kind === 'stopped' ? 'was stopped' : 'answered';
      rows.push({ at: e.at, who: agent.name, windowId: agent.windowId, text: `${verb} ${e.text || ''}`.trim() });
    }
  }
  for (const t of office.threads) {
    const at = ms(t.updatedAt);
    if (!at) continue;
    const text = t.status === 'completed' ? `answered ${t.fromLabel}` : t.status === 'failed' ? `could not help ${t.fromLabel}` : `was asked by ${t.fromLabel}: ${t.task}`;
    rows.push({ at, who: t.toLabel, windowId: t.to, text });
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, limit);
}
