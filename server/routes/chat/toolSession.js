import { TOOL_DISCOVERY_NAMES } from '../../tools/definitions/discovery.js';

const DISCOVERY_PROMPT = [
  'Tools are loaded on demand.',
  'Start with search_tools when you need a capability, then call get_tool with the exact returned name.',
  'After get_tool succeeds, that tool becomes available on the next turn.',
].join(' ');

export function createChatToolSession(toolsForCaller, provider) {
  const permittedTools = Array.isArray(toolsForCaller) ? toolsForCaller : [];
  const toolsByName = new Map(
    permittedTools.map(tool => [tool.function.name, tool])
  );
  const discoveryTools = TOOL_DISCOVERY_NAMES
    .map(name => toolsByName.get(name))
    .filter(Boolean);
  const discoveryFirst = provider === 'cohere'
    && discoveryTools.length === TOOL_DISCOVERY_NAMES.length
    && permittedTools.length > discoveryTools.length;
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
    observe(toolName, args, ok) {
      if (ok && toolName === 'get_tool') this.activate(args.name);
    },
  };
}
