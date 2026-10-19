// Who a to-do can be assigned to. The `assignee` field on a to-do holds one of:
//   "<agent id>"        a board agent (Atlas, Nexus, ...), as before
//   "user:<user id>"    a person on the board ("Me" in the Assign menu)
//   "cli:<cli id>"      a coding agent from the Agent Console (Claude Code, Codex, ...)
// `assigneeName` rides along so teammates see a name without looking anyone up.
// Pure: shared by the board and the server (server/todos/mine.js).

/** The coding agents the Agent Console can drive (server/cli-agents/adapters), in picker order. */
export const CODING_AGENTS = Object.freeze([
  { id: 'claudecode', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'copilot', label: 'Copilot CLI' },
  { id: 'grok', label: 'Grok' },
]);

const CODING_AGENT_IDS = new Set(CODING_AGENTS.map((a) => a.id));

export const personAssignee = (userId) => (userId == null || userId === '' ? null : `user:${userId}`);
export const codingAgentAssignee = (cliId) => (CODING_AGENT_IDS.has(cliId) ? `cli:${cliId}` : null);

/** { type: 'person' | 'cli' | 'agent', id } for an assignee value, or null when unassigned. */
export function parseAssignee(value) {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (!text) return null;
  if (text.startsWith('user:')) return { type: 'person', id: text.slice(5) };
  if (text.startsWith('cli:')) {
    const id = text.slice(4);
    return CODING_AGENT_IDS.has(id) ? { type: 'cli', id } : null;
  }
  return { type: 'agent', id: text };
}

export function codingAgentLabel(cliId) {
  return CODING_AGENTS.find((a) => a.id === cliId)?.label || cliId;
}

const isTodoWindow = (win) => win && (win.kind === 'todos' || win.type === 'todos') && Array.isArray(win.items);

/**
 * Open to-dos assigned to this person in a board's windows, oldest list first:
 * [{ windowId, listTitle, itemId, text }].
 */
export function openTodosFor(wins, userId) {
  const mine = personAssignee(userId);
  if (!mine || !Array.isArray(wins)) return [];
  const out = [];
  for (const win of wins) {
    if (!isTodoWindow(win)) continue;
    for (const item of win.items) {
      if (!item || item.done || String(item.assignee || '') !== mine) continue;
      const text = String(item.text ?? item.title ?? '').trim() || 'Untitled task';
      out.push({ windowId: win.id, listTitle: win.title || 'To-do List', itemId: item.id, text });
    }
  }
  return out;
}
