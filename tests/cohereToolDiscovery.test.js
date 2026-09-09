import { jest } from '@jest/globals';

const executeTool = jest.fn(async (_agentId, toolName, args) => {
  if (toolName === 'get_tool') return JSON.stringify({ name: args.name });
  return 'project contents';
});

jest.unstable_mockModule('../server/tools.js', () => ({
  executeTool,
  TOOL_DEFINITIONS: [],
  filterToolsForAgent: jest.fn(async () => []),
  listToolCatalog: jest.fn(() => []),
}));

jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  shouldSynthesizeAfterToolBatch: () => false,
  buildToolSynthesisPrompt: () => '',
  summarizeToolActions: () => '(tools ran)',
}));

const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');

function toolDef(name, required = []) {
  return {
    type: 'function',
    function: {
      name,
      parameters: { type: 'object', properties: {}, required },
    },
  };
}

function modelTurn(message) {
  return { ok: true, json: async () => ({ choices: [{ message }] }) };
}

test('Cohere starts with discovery tools and activates a requested tool', async () => {
  const requestTools = [];
  global.fetch = jest.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    requestTools.push(body.tools?.map(tool => tool.function.name) || []);
    if (requestTools.length === 1) {
      return modelTurn({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'discover',
          function: { name: 'get_tool', arguments: '{"name":"project_read"}' },
        }],
      });
    }
    if (requestTools.length === 2) {
      return modelTurn({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'read',
          function: { name: 'project_read', arguments: '{"path":"README.md"}' },
        }],
      });
    }
    return modelTurn({ role: 'assistant', content: 'Read complete.' });
  });

  const result = await runChatLoop({
    agentId: 'atlas',
    chatMessages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'read it' }],
    toolsForCaller: [
      toolDef('search_tools', ['query']),
      toolDef('get_tool', ['name']),
      toolDef('project_read', ['path']),
    ],
    reqModel: 'north-mini-code-1-0',
    reqBaseUrl: 'http://stub',
    reqApiKey: 'key',
    reqProvider: 'cohere',
    sendEvent: () => {},
    timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
  });

  expect(requestTools).toEqual([
    ['search_tools', 'get_tool'],
    ['search_tools', 'get_tool', 'project_read'],
    ['search_tools', 'get_tool', 'project_read'],
  ]);
  expect(executeTool.mock.calls.map(call => call[1])).toEqual(['get_tool', 'project_read']);
  expect(result.finalText).toBe('Read complete.');
});
