// The shared run record a chat window keeps while its agent works:
// `agentRun` on the window. It syncs through the board's Yjs doc, so every
// teammate's WeeWoo office sees the same agent start thinking, call a
// tool, finish or fail. The streamed text itself stays local (spec 3);
// only these few state changes are written. Pure.

const MAX_LOG = 12;
const MAX_TEXT = 140;

function clip(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
}

function withLog(run, entry) {
  return [...(Array.isArray(run?.log) ? run.log : []), entry].slice(-MAX_LOG);
}

/** A run starts: the agent is thinking about `prompt`. */
export function runStarted(run, { prompt = '', now = Date.now() } = {}) {
  const task = clip(prompt);
  return { state: 'thinking', task, tool: null, startedAt: now, at: now, log: withLog(run, { at: now, kind: 'start', text: task }) };
}

/** The agent calls a tool. */
export function runTool(run, { tool = '', now = Date.now() } = {}) {
  const name = clip(tool) || 'a tool';
  return { ...(run || {}), state: 'tool', tool: name, at: now, log: withLog(run, { at: now, kind: 'tool', text: name }) };
}

/** The run ends: 'done', 'error' or 'stopped', with the reply or error text. */
export function runEnded(run, { state = 'done', text = '', now = Date.now() } = {}) {
  const end = ['done', 'error', 'stopped'].includes(state) ? state : 'done';
  return { ...(run || {}), state: end, tool: null, at: now, endedAt: now, log: withLog(run, { at: now, kind: end, text: clip(text) }) };
}

/** Tool name from a chat status detail (the shapes useChat sees). */
export function toolNameFrom(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  return detail.name || detail.tool || detail.toolName || detail.function?.name || '';
}
