import { describe, expect, jest, test } from '@jest/globals';

// Diagram 09: load a whole kit at once, and search for tools first on every provider.
const CATALOG = [
  { name: 'search_tools', kit: 'Default Tools', type: 'toolDiscovery', description: 'find', tags: [] },
  { name: 'get_toolkit', kit: 'Default Tools', type: 'toolDiscovery', description: 'kit', tags: [] },
  { name: 'project_read', kit: 'Coding Operations', type: 'fileOps', description: 'read a file', tags: ['file'] },
  { name: 'project_write', kit: 'Coding Operations', type: 'fileOps', description: 'write a file', tags: ['file'] },
  { name: 'container_restart', kit: 'Server Maintenance', type: 'serverOps', description: 'restart', tags: [] },
  { name: 'secret_admin', kit: 'Coding Operations', type: 'fileOps', description: 'not allowed', tags: [] },
];
const def = (name) => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } });

jest.unstable_mockModule('../server/tools/rbac/checks.js', () => ({
  filterToolsForAgent: jest.fn(async () => CATALOG.filter((t) => t.name !== 'secret_admin').map((t) => def(t.name))),
}));
jest.unstable_mockModule('../server/tools/catalog.js', () => ({ listToolCatalog: () => ({ tools: CATALOG }) }));

const { handleToolDiscovery } = await import('../server/tools/handlers/discovery.js');
const { createChatToolSession, useSearchFirst, SEARCH_FIRST_MIN_TOOLS } = await import('../server/routes/chat/toolSession.js');
const { TOOL_DISCOVERY_NAMES, discoveryTools } = await import('../server/tools/definitions/discovery.js');

describe('get_toolkit', () => {
  test('is a discovery tool every agent gets', () => {
    expect(TOOL_DISCOVERY_NAMES).toContain('get_toolkit');
    expect(discoveryTools.map((t) => t.function.name)).toEqual(TOOL_DISCOVERY_NAMES);
  });

  test('returns every allowed tool in the kit, however the kit name is written', async () => {
    for (const kit of ['Coding Operations', 'coding-operations', 'CODING operations']) {
      const result = JSON.parse(await handleToolDiscovery('atlas', 'get_toolkit', { kit }));
      expect(result.kit).toBe('Coding Operations');
      expect(result.tools.map((t) => t.name)).toEqual(['project_read', 'project_write']);
    }
  });

  test('an unknown kit lists the kits the agent can use', async () => {
    const result = JSON.parse(await handleToolDiscovery('atlas', 'get_toolkit', { kit: 'Gardening' }));
    expect(result.error).toMatch(/No kit called "Gardening"/);
    expect(result.kits).toEqual(['Coding Operations', 'Server Maintenance']);
  });
});

describe('search-first chat sessions', () => {
  const discovery = TOOL_DISCOVERY_NAMES.map(def);
  const many = Array.from({ length: SEARCH_FIRST_MIN_TOOLS + 1 }, (_, i) => def(`tool_${i}`));

  test('every provider searches first once an agent has many tools', () => {
    for (const provider of ['anthropic', 'openai', 'google', 'ollama']) {
      const session = createChatToolSession([...discovery, ...many], provider);
      expect(session.discoveryFirst).toBe(true);
      expect(session.list().map((t) => t.function.name)).toEqual(TOOL_DISCOVERY_NAMES);
      expect(session.prompt).toMatch(/get_toolkit/);
    }
  });

  test('a small tool list goes whole, except on Cohere; the setting can force either way', () => {
    const few = [...discovery, def('project_read')];
    expect(createChatToolSession(few, 'openai').discoveryFirst).toBe(false);
    expect(createChatToolSession(few, 'cohere').discoveryFirst).toBe(true);
    expect(useSearchFirst('openai', 3, 'always')).toBe(true);
    expect(useSearchFirst('cohere', 100, 'off')).toBe(false);
  });

  test('loading a kit makes all of its tools ready on the next step', () => {
    const session = createChatToolSession([...discovery, def('project_read'), def('project_write'), ...many], 'openai');
    const kit = JSON.stringify({ kit: 'Coding Operations', tools: [{ name: 'project_read' }, { name: 'project_write' }, { name: 'not_permitted' }] });
    session.observe('get_toolkit', { kit: 'Coding Operations' }, true, kit);
    expect(session.list().map((t) => t.function.name)).toEqual([...TOOL_DISCOVERY_NAMES, 'project_read', 'project_write']);
    session.observe('get_toolkit', {}, true, 'not json');
    session.observe('get_tool', { name: 'tool_3' }, false);
    expect(session.list()).toHaveLength(TOOL_DISCOVERY_NAMES.length + 2);
  });
});

describe('chat cards for tool discovery', () => {
  test('say what the agent did in plain words', async () => {
    const { summarizeToolCall } = await import('../server/routes/chat/toolSummary.js');
    const { describeToolEvent } = await import('../src/components/chat/toolActivity.js');
    const label = (tool, args) => describeToolEvent({ tool, summary: summarizeToolCall(tool, args) }, { past: true }).label;
    expect(label('get_toolkit', { kit: 'Coding Operations' })).toBe('Loaded the tool kit “Coding Operations”');
    expect(label('search_tools', { query: 'restart a container' })).toBe('Looked for a tool “restart a container”');
    expect(label('get_tool', { name: 'project_read' })).toBe('Picked up the tool “project_read”');
  });
});
