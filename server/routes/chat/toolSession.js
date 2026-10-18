import { TOOL_DISCOVERY_NAMES } from '../../tools/definitions/discovery.js';

const DISCOVERY_PROMPT = [
  'Tools are loaded on demand.',
  'Start with search_tools when you need a capability, then call get_tool with the exact returned name,',
  'or get_toolkit with a kit name to load every tool in that kit at once.',
  'Tools you load become available on the next turn.',
].join(' ');

// Search-first (Alex's diagram 09): the agent starts with only the discovery
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

export function createChatToolSession(toolsForCaller, provider) {
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
  const activeTools = new Map(
    (discoveryFirst ? discoveryTools : permittedTools)
      .map(tool => [tool.function.name, tool])
  );

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
      return true;
    },
    observe(toolName, args, ok, result) {
      if (!ok) return;
      if (toolName === 'get_tool') this.activate(args?.name);
      if (toolName === 'get_toolkit') kitToolNames(result).forEach(name => this.activate(name));
    },
  };
}
