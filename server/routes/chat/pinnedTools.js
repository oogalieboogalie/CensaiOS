// Tools pinned by the canvas group a chat's agent sits in (card R3).
//
// A chat makes a fresh tool session for every message, so a tool the agent
// loaded with get_tool is gone on the next one. When the agent's canvas group
// holds a window it works through (a yorCad CAD window), the tools for that
// window are loaded from the first round of every message instead.
//
// Pinning never widens what an agent may use: only tools already in the list
// this agent was given (filterToolsForAgent, then the run engine's additions)
// can be pinned. An agent without the CAD modules gets nothing new.

import { chatLog } from './chatLog.js';

// Window kind -> tools loaded while that window shares the agent's group.
// A later card adds a kind with one line here.
export const PINNED_TOOLS_BY_WINDOW_KIND = Object.freeze({
  yorCad: Object.freeze(['read_cad_part', 'edit_cad_part']),
});

const MAX_KINDS = 64;
const PINNED = Symbol('censai.pinnedToolNames');

/** The window kinds a chat request says share the agent's group: short strings, at most 64. */
export function cleanGroupWindowKinds(value) {
  if (!Array.isArray(value)) return [];
  const kinds = value
    .filter(kind => typeof kind === 'string' && kind.length > 0 && kind.length <= 64)
    .slice(0, MAX_KINDS);
  return [...new Set(kinds)];
}

/** Tool names pinned by these window kinds (not yet checked against the agent's tools). */
export function pinnedToolsFor({ groupWindowKinds } = {}) {
  const names = cleanGroupWindowKinds(groupWindowKinds)
    .flatMap(kind => (Object.hasOwn(PINNED_TOOLS_BY_WINDOW_KIND, kind) ? PINNED_TOOLS_BY_WINDOW_KIND[kind] : []));
  return [...new Set(names)];
}

/**
 * The same tool list, marked with the pinned names this agent was given.
 * The list itself is not changed, so what the agent may run stays the same.
 */
export function withPinnedTools(tools, names) {
  const list = Array.isArray(tools) ? tools : [];
  const given = new Set(list.map(tool => tool?.function?.name).filter(Boolean));
  const pinned = (Array.isArray(names) ? names : []).filter(name => given.has(name));
  if (pinned.length === 0) return list;
  const marked = [...list];
  Object.defineProperty(marked, PINNED, { value: Object.freeze(pinned), enumerable: false });
  return marked;
}

/** The pinned names a tool list carries (empty for an unmarked list). */
export function pinnedToolNamesOf(tools) {
  return Array.isArray(tools?.[PINNED]) ? tools[PINNED] : [];
}

/**
 * A run-engine toolFilter for one chat request: marks the pinned tools this
 * agent was given, and logs once (count and window kinds only) when any are.
 */
export function groupPinFilter(groupWindowKinds, { agentId = null, log = chatLog } = {}) {
  const kinds = cleanGroupWindowKinds(groupWindowKinds);
  const wanted = pinnedToolsFor({ groupWindowKinds: kinds });
  if (wanted.length === 0) return null;
  return (tools) => {
    const marked = withPinnedTools(tools, wanted);
    const count = pinnedToolNamesOf(marked).length;
    if (count > 0) {
      const pinKinds = kinds.filter(kind => Object.hasOwn(PINNED_TOOLS_BY_WINDOW_KIND, kind));
      log.info('group tools pinned', { agentId, count, windowKinds: pinKinds });
    }
    return marked;
  };
}
