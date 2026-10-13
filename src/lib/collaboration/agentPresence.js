// Agent cursors: the server publishes one awareness state per board listing
// the agents running there (server/collab/agentPresence.js):
//   { agents: [{ id, agentId, name, color, home, at, phase, label, tail, total }] }
// These pure helpers read that state, pick where each cursor points, and
// step the typing so only new characters are typed out. No React here.

const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const PHASES = new Set(['reading', 'thinking', 'tool', 'typing', 'done']);
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|oklch\([0-9.\s%]+\)|hsl\([0-9.\s%]+\))$/;
export const AGENT_FALLBACK_COLOR = '#E5A83A';

function windowId(value) {
  return ID_PATTERN.test(String(value ?? '')) ? String(value) : null;
}

function cleanAgent(entry, clientId) {
  if (!entry || typeof entry !== 'object') return null;
  const home = windowId(entry.home);
  const id = windowId(entry.id);
  if (!home || !id) return null;
  const color = typeof entry.color === 'string' && COLOR_PATTERN.test(entry.color) ? entry.color : AGENT_FALLBACK_COLOR;
  return {
    key: `${clientId}:${id}`,
    agentId: String(entry.agentId || '').slice(0, 64),
    name: String(entry.name || 'Agent').slice(0, 40),
    color,
    home,
    at: windowId(entry.at) || home,
    phase: PHASES.has(entry.phase) ? entry.phase : 'thinking',
    label: String(entry.label || '').slice(0, 60),
    tail: String(entry.tail || '').slice(-240),
    total: Number.isFinite(entry.total) && entry.total > 0 ? Math.floor(entry.total) : 0,
  };
}

/** Awareness states -> { [key]: agent cursor } for every agent running on the board. */
export function readAgentPresence(states) {
  const agents = {};
  for (const [rawId, state] of states || []) {
    if (!Array.isArray(state?.agents)) continue;
    for (const entry of state.agents.slice(0, 12)) {
      const agent = cleanAgent(entry, String(rawId));
      if (agent) agents[agent.key] = agent;
    }
  }
  return agents;
}

/** Windows an agent is pointing at get a quiet outline in its colour. */
export function agentOutlines(agents = {}) {
  const outlines = {};
  for (const agent of Object.values(agents)) {
    if (agent.phase === 'done' || outlines[agent.at]) continue;
    outlines[agent.at] = { type: 'agent', id: agent.agentId, label: agent.name, color: agent.color };
  }
  return outlines;
}

const STATUS = { reading: 'reading', thinking: 'thinking', tool: 'working', typing: 'typing', done: 'done' };

/** The short word or phrase beside the agent's name. */
export function agentStatus(agent) {
  if ((agent.phase === 'tool' || agent.phase === 'reading') && agent.label) return agent.label;
  return STATUS[agent.phase] || 'thinking';
}

/**
 * Where the cursor sits, in canvas coordinates: at the bottom of its own
 * window while it thinks and types (where a person's reply would go), near
 * the top of a window it is reading.
 */
export function agentCursorPoint(agent, win) {
  if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) return null;
  const w = Number.isFinite(win.w) ? win.w : 360;
  const h = Number.isFinite(win.h) ? win.h : 280;
  if (agent.at !== agent.home) return { x: win.x + Math.min(w * 0.5, 220), y: win.y + Math.min(56, h * 0.3) };
  return { x: win.x + Math.min(40, w * 0.15), y: win.y + Math.max(40, h - 58) };
}

/**
 * One typing step. `shown` counts characters already typed; returns the new
 * count, moving faster when far behind so a long answer never lags the run.
 */
export function stepTyping(shown, total, tailLength) {
  if (shown >= total) return total;
  const behind = Math.min(total - shown, tailLength);
  const from = total - behind;
  return Math.min(total, from + Math.max(1, Math.ceil(behind / 24)));
}

/** The last few words, so the newest writing is always what shows. */
export function latestWords(text, max = 110) {
  if (text.length <= max) return text;
  return `…${text.slice(-max).replace(/^\S*\s/, '')}`;
}

/** The visible text for `shown` typed characters out of `total`, from the tail. */
export function typedText(tail, total, shown) {
  const hidden = Math.max(0, total - shown);
  return hidden >= tail.length ? '' : tail.slice(0, tail.length - hidden);
}
