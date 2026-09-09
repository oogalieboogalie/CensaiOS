import { jest } from '@jest/globals';

const executeTool = jest.fn();

jest.unstable_mockModule('../server/tools.js', () => ({
  executeTool,
  TOOL_DEFINITIONS: [],
  filterToolsForAgent: jest.fn(async () => []),
  listToolCatalog: jest.fn(() => []),
}));

const {
  detectUnexecutedClaims,
  UNEXECUTED_CLAIM_WARNING,
} = await import('../server/routes/chat/claimTripwire.js');
const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');

const originalFetch = global.fetch;

function modelTurn(message) {
  return { ok: true, json: async () => ({ choices: [{ message }] }) };
}

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
});

describe('claimed-action tripwire', () => {
  test('warns when text claims an action but no tools ran', () => {
    expect(detectUnexecutedClaims(
      'I have dispatched the sub-agent and created the task.',
      []
    )).toBe(UNEXECUTED_CLAIM_WARNING);
  });

  test('stays silent when tools ran', () => {
    expect(detectUnexecutedClaims(
      'I have dispatched the sub-agent.',
      [{ tool: 'delegate_to_subagent' }]
    )).toBeNull();
  });

  test('warns when every requested tool action failed or remained pending', () => {
    expect(detectUnexecutedClaims(
      'I wrote the requested file.',
      [{ tool: 'project_write', ok: false }]
    )).toBe(UNEXECUTED_CLAIM_WARNING);
  });

  test('stays silent for ordinary no-tool replies', () => {
    expect(detectUnexecutedClaims(
      'I can help you set that up.',
      []
    )).toBeNull();
  });

  test('stays silent when the model admits failure', () => {
    expect(detectUnexecutedClaims(
      'I tried to create the task but failed because tools are disabled.',
      []
    )).toBeNull();
  });

  test('chat loop appends the warning and emits a status event', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(modelTurn({
        role: 'assistant',
        content: 'I have created the task for you.',
      }));
    const events = [];

    const { finalText, toolActions } = await runChatLoop({
      agentId: 'atlas',
      windowId: 'w1',
      chatMessages: [{ role: 'user', content: 'create a task' }],
      toolsForCaller: [],
      reqModel: 'test-model',
      reqBaseUrl: 'http://stub',
      reqApiKey: 'k',
      sendEvent: event => events.push(event),
      timings: { total_ms: 0, setup_ms: 0, model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
    });

    expect(toolActions).toEqual([]);
    expect(finalText).toBe(`I have created the task for you.\n\n${UNEXECUTED_CLAIM_WARNING}`);
    expect(events).toContainEqual({ type: 'status', status: 'unexecuted_claim' });
    expect(executeTool).not.toHaveBeenCalled();
  });
});
