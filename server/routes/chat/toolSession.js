import { ALWAYS_LOADED_TOOL_NAMES, TOOL_DISCOVERY_NAMES } from '../../tools/definitions/discovery.js';
import { pinnedToolNamesOf } from './pinnedTools.js';

// The last line matters: it used to say tools work "on the next turn", and
// models read that as "after the person's next message". They loaded a tool,
// stopped, asked the person to say "do it", then lost the tool and did the
// same thing again on every message.
const DISCOVERY_PROMPT = [
  'Tools are loaded on demand.',
  'Start with search_tools when you need a capability, then call get_tool with the exact returned name,',
  'or get_toolkit with a kit name to load every tool in that kit at once.',
  'A tool you load is ready right away, in this same reply: call it in your very next step.',
  'Loading a tool is never a reason to stop and ask the person to confirm.',
  'Tools you loaded earlier in this chat stay loaded.',
].join(' ');

// Tools loaded in one chat window stay loaded for that window's later messages,
// so a "go ahead" can run the write that was loaded a message earlier. Kept in
// this process only: a server restart forgets them, and the agent loads again.
const CARRY_OVER_MS = 6 * 60 * 60 * 1000;
const CARRY_OVER_MAX_CHATS = 500;
// Only the most recently loaded tools carry over, so a long chat that loaded
// several kits never sends more tools than a provider takes (some cap at 128).
export const CARRY_OVER_MAX_TOOLS = 32;
const loadedByChat = new Map();

function chatKeyOf(agentId, windowId) {
  return agentId && windowId ? `${agentId}\u0000${windowId}` : null;
}

function rememberedNames(key, now) {
  const entry = key ? loadedByChat.get(key) : null;
  if (!entry) return [];
  if (now - entry.at > CARRY_OVER_MS) {
    loadedByChat.delete(key);
    return [];
  }
  entry.at = now; // a chat in use keeps its tools
  return [...entry.names];
}

function remember(key, name, now) {
  if (!key) return;
  const entry = loadedByChat.get(key) || { names: new Set(), at: now };
  entry.names.delete(name); // newest last
  entry.names.add(name);
  while (entry.names.size > CARRY_OVER_MAX_TOOLS) {
    entry.names.delete(entry.names.values().next().value);
  }
  entry.at = now;
  loadedByChat.delete(key);
  loadedByChat.set(key, entry);
  while (loadedByChat.size > CARRY_OVER_MAX_CHATS) {
    loadedByChat.delete(loadedByChat.keys().next().value);
  }
}

// For tests.
export function forgetLoadedTools() {
  loadedByChat.clear();
}

// Search-first (diagram 09): the agent starts with only the discovery
// tools and loads what it needs. Cohere always works this way; every other
// provider does once an agent has more than this many tools, where sending
// the whole list costs the most. CENSAI_TOOL_SEARCH_FIRST=off turns it off,
// =always uses it for every agent.
export const SEARCH_FIRST_MIN_TOOLS = 24;

export function useSearchFirst(provider, toolCount, mode = process.env.CENSAI_TOOL_SEARCH_FIRST) {
  const setting = String(mode || 'auto').toLowerCase();
  if (setting === 'off') return false;
  if (setting === 'always' || provider === 'cohere') return true;
  return toolCount > SEARCH_FIRST_MIN_TOOLS;
}

// Names of the tools a get_toolkit result handed back.
function kitToolNames(result) {
  try {
    const parsed = JSON.parse(String(result || ''));
    return Array.isArray(parsed?.tools) ? parsed.tools.map(tool => tool?.name).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function createChatToolSession(toolsForCaller, provider, { agentId = null, windowId = null, now = Date.now } = {}) {
  const chatKey = chatKeyOf(agentId, windowId);
  const permittedTools = Array.isArray(toolsForCaller) ? toolsForCaller : [];
  const toolsByName = new Map(
    permittedTools.map(tool => [tool.function.name, tool])
  );
  const discoveryTools = TOOL_DISCOVERY_NAMES
    .map(name => toolsByName.get(name))
    .filter(Boolean);
  // search_tools and get_tool are the minimum; get_toolkit joins when granted.
  const discoveryFirst = toolsByName.has('search_tools') && toolsByName.has('get_tool')
    && permittedTools.length > discoveryTools.length
    && useSearchFirst(provider, permittedTools.length - discoveryTools.length);
  // Always-loaded tools, plus any the agent's canvas group pins (pinnedTools.js; only tools it was given).
  const alwaysLoaded = [...ALWAYS_LOADED_TOOL_NAMES, ...pinnedToolNamesOf(toolsForCaller)]
    .map(name => toolsByName.get(name)).filter(Boolean);
  const activeTools = new Map(
    (discoveryFirst ? [...discoveryTools, ...alwaysLoaded] : permittedTools)
      .map(tool => [tool.function.name, tool])
  );
  // Only tools this agent is still allowed come back (toolsByName is today's list).
  if (discoveryFirst) {
    for (const name of rememberedNames(chatKey, now())) {
      const tool = toolsByName.get(name);
      if (tool) activeTools.set(name, tool);
    }
  }

  return {
    discoveryFirst,
    prompt: discoveryFirst ? DISCOVERY_PROMPT : null,
    list() {
      return [...activeTools.values()];
    },
    activate(name) {
      const tool = toolsByName.get(name);
      if (!tool) return false;
      activeTools.set(name, tool);
      if (discoveryFirst) remember(chatKey, name, now());
      return true;
    },
    observe(toolName, args, ok, result) {
      if (!ok) return;
      if (toolName === 'get_tool') this.activate(args?.name);
      if (toolName === 'get_toolkit') kitToolNames(result).forEach(name => this.activate(name));
    },
  };
}
