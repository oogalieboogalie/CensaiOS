import { jest } from '@jest/globals';

// Real runChatLoop, mocked tool layer + model endpoint: proves the harness —
// not the model — stamps ok on completed_tool events, toolActions, and
// timings.tool_calls, and that the public response mappers preserve it.
const executeTool = jest.fn(async (agentId, toolName) => {
  if (toolName === 'mailcow_domains') return 'Error: MAILCOW_URL not configured';
  return 'MAILCOW DOMAINS (2) ...';
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
const { publicToolActions, publicTimings } = await import('../server/routes/chat/shared.js');

function toolDef(name, required = []) {
  return { type: 'function', function: { name, parameters: { type: 'object', required } } };
}

function modelTurn(message) {
  return { ok: true, json: async () => ({ choices: [{ message }] }) };
}

describe('runChatLoop tool truth threading', () => {
  test('failed, ok, and malformed-args calls each carry the right ok flag end to end', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(modelTurn({
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', function: { name: 'mailcow_domains', arguments: '{}' } },
          { id: 'c2', function: { name: 'web_search', arguments: '{"query":"censai"}' } },
          { id: 'c3', function: { name: 'project_read', arguments: '{not json' } },
        ],
      }))
      .mockResolvedValueOnce(modelTurn({ role: 'assistant', content: 'All done.' }));

    const events = [];
    const timings = { total_ms: 0, setup_ms: 0, model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] };

    const { finalText, toolActions } = await runChatLoop({
      agentId: 'atlas',
      windowId: 'w1',
      chatMessages: [{ role: 'user', content: 'check the mail server' }],
      toolsForCaller: [toolDef('mailcow_domains'), toolDef('web_search', ['query']), toolDef('project_read', ['path'])],
      reqModel: 'test-model',
      reqBaseUrl: 'http://stub',
      reqApiKey: 'k',
      sendEvent: (e) => events.push(e),
      timings,
    });

    expect(finalText).toBe('All done.');
    // The malformed-args call must never reach executeTool.
    expect(executeTool).toHaveBeenCalledTimes(2);

    const completed = events.filter(e => e.status === 'completed_tool');
    expect(completed.map(e => [e.detail.tool, e.detail.ok])).toEqual([
      ['mailcow_domains', false],
      ['web_search', true],
      ['project_read', false],
    ]);

    expect(toolActions.map(a => [a.tool, a.ok])).toEqual([
      ['mailcow_domains', false],
      ['web_search', true],
      ['project_read', false],
    ]);
    expect(timings.tool_calls.map(c => [c.tool, c.ok])).toEqual([
      ['mailcow_domains', false],
      ['web_search', true],
      ['project_read', false],
    ]);

    // The flag survives the public response mappers (additive key, args/results still stripped).
    expect(publicToolActions(toolActions).map(t => t.ok)).toEqual([false, true, false]);
    expect(publicToolActions(toolActions)[0].result).toBeUndefined();
    expect(publicTimings(timings).tool_calls.map(t => t.ok)).toEqual([false, true, false]);
  });
});
