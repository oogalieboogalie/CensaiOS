import { jest } from '@jest/globals';

// An agent runs only the tools it was given. A model can name any tool, one
// it knows from its training or one that words in the chat ask for, so a
// chat, an agent waking up and a task handed to a helper agent each answer a
// tool they did not offer with plain words, and nothing runs. The person is
// made up: Pat Example owns this computer, so the owner-only rules let every
// tool through here and only the offer decides.
const PAT = 1;
const executeTool = jest.fn(async (_agentId, name) => `${name} ran`);
const filterToolsForAgent = jest.fn();
const callModel = jest.fn();
const evaluatePolicy = jest.fn(async () => ({ decision: 'allow' }));
const updateAgentTask = jest.fn(async () => ({}));

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.unstable_mockModule('../server/tools.js', () => ({ executeTool, filterToolsForAgent, TOOL_DEFINITIONS: [] }));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  aiGatewayLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  CHAT_COMPLETION_TIMEOUT_MS: 30000,
  DEFAULT_CHAT_BASE_URL: 'http://made-up.invalid',
  DEFAULT_CHAT_MODEL: 'made-up-model',
  OLLAMA_CHAT_MODEL_ALIASES: [],
  getDefaultChatApiKey: jest.fn(() => 'made-up-key'),
  callModel,
  createModelAccessContext: jest.fn((value) => value),
  resolveChatModelConfig: jest.fn(() => ({ model: 'made-up-model' })),
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  shouldSynthesizeAfterToolBatch: () => false,
  buildToolSynthesisPrompt: () => '',
  summarizeToolActions: () => '',
}));
jest.unstable_mockModule('../server/policy/engine.js', () => ({ evaluatePolicy }));
jest.unstable_mockModule('../server/policy/evidence.js', () => ({ recordPolicyEvidence: jest.fn(async () => {}) }));
jest.unstable_mockModule('../server/memory.js', async () => {
  const { buildCompletionReceipt } = await import('../server/memory/tasks/receipts.js');
  return {
    updateAgentTask,
    getSubAgentById: jest.fn(async () => ({ id: 'made-up-helper', name: 'Made-up helper' })),
    sendAgentMessage: jest.fn(async () => {}),
    buildCompletionReceipt,
  };
});
jest.unstable_mockModule('../server/routes/chat/index.js', () => ({
  buildSubAgentSystemPrompt: jest.fn(async () => 'Made-up system words.'),
  getSubAgentModelConfig: jest.fn(() => ({ modelName: 'made-up-model', baseUrl: 'http://made-up.invalid', apiKey: 'made-up-key' })),
}));
jest.unstable_mockModule('../server/task-worker/batch.js', () => ({ checkBatchCompletion: jest.fn(async () => {}) }));
// Only the outside-caller tool filter is used from the agent endpoint here.
jest.unstable_mockModule('../server/runEngine/index.js', () => ({ runAgentTurn: jest.fn() }));

const { runChatLoop } = await import('../server/routes/chat/chatExecution.js');
const { runWakeModel } = await import('../server/agent-wakeups/modelLoop.js');
const { runTask } = await import('../server/task-worker/execution.js');
const { outsideTools } = await import('../server/agentEndpoints/runAgent.js');
const { toolNotOfferedResult } = await import('../server/tools/rbac/offeredTools.js');
const { toolCallOk } = await import('../server/routes/chat/toolOutcome.js');

const tools = (...names) => names.map((name) => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } }));
const named = (list) => list.map((t) => t.function.name);
const asks = (...names) => ({
  choices: [{
    message: {
      role: 'assistant',
      tool_calls: names.map((name, i) => ({ id: `made-up-call-${i}`, function: { name, arguments: '{"path":"made-up-notes.md","content":"Made-up words."}' } })),
    },
  }],
});
const says = (content) => ({ choices: [{ message: { role: 'assistant', content } }] });
const ran = () => executeTool.mock.calls.map(([, name]) => name);
const toolMessage = (messages, id) => messages.find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;

const chat = (toolsForCaller) => runChatLoop({
  agentId: 'made-up-scribe',
  chatMessages: [{ role: 'system', content: 'Made-up system words.' }, { role: 'user', content: 'Made-up ask.' }],
  toolsForCaller,
  reqModel: 'made-up-model',
  userId: PAT,
  authorizationWorkspaceId: 'made-up-board',
  sendEvent: jest.fn(),
  timings: { model_ms: 0, tool_ms: 0, model_calls: [], tool_calls: [] },
});

beforeEach(() => {
  jest.clearAllMocks();
  callModel.mockReset();
});

describe('a chat runs only the tools it gave its agent', () => {
  test('a tool the chat did not give gets plain words and does not run; the one it gave still runs', async () => {
    callModel.mockResolvedValueOnce(asks('local_write_file', 'project_read')).mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(tools('project_read'));
    expect(ran()).toEqual(['project_read']);
    expect(toolActions.map((a) => [a.tool, a.ok, a.result])).toEqual([
      ['local_write_file', false, toolNotOfferedResult('local_write_file')],
      ['project_read', true, 'project_read ran'],
    ]);
    // The model reads the words back, and a call that never runs is not put to the policy check.
    expect(toolMessage(callModel.mock.calls[1][0].body.messages, 'made-up-call-0')).toBe(toolNotOfferedResult('local_write_file'));
    expect(evaluatePolicy).not.toHaveBeenCalled();
  });

  test('the words name the tool, say it did not run, and mark the call as not done', () => {
    expect(toolNotOfferedResult('local_write_file')).toBe(
      'Error: "local_write_file" is not one of the tools you were given here, so it did not run. '
      + 'Use only the tools you were given, and tell the person in plain words if they cannot do what was asked.'
    );
    expect(toolCallOk(toolNotOfferedResult('local_write_file'))).toBe(false);
    expect(toolNotOfferedResult('made-up-'.repeat(100)).length).toBeLessThan(300);
  });

  test('a chat with no agent gives no tools, so none runs', async () => {
    callModel.mockResolvedValueOnce(asks('project_read')).mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(null);
    expect(ran()).toEqual([]);
    expect(toolActions[0].result).toBe(toolNotOfferedResult('project_read'));
  });

  test("an outside app's question runs only the look-up tools its agent is given there", async () => {
    const given = outsideTools(tools('project_read', 'local_write_file', 'message_to', 'sandbox_exec', 'web_search'));
    expect(named(given)).toEqual(['project_read', 'web_search']);
    callModel.mockResolvedValueOnce(asks('message_to', 'sandbox_exec', 'web_search')).mockResolvedValueOnce(says('Made-up answer.'));
    const { toolActions } = await chat(given);
    expect(ran()).toEqual(['web_search']);
    expect(toolActions.map((a) => [a.tool, a.ok])).toEqual([['message_to', false], ['sandbox_exec', false], ['web_search', true]]);
  });

  test('an agent that loads its tools as it goes still runs any tool it was given, and only those', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `made_up_tool_${i}`);
    callModel.mockResolvedValueOnce(asks('made_up_tool_7', 'local_write_file')).mockResolvedValueOnce(says('Made-up answer.'));
    await chat(tools('search_tools', 'get_tool', ...many));
    expect(named(callModel.mock.calls[0][0].body.tools)).not.toContain('made_up_tool_7');
    expect(ran()).toEqual(['made_up_tool_7']);
  });
});

describe('an agent waking up runs only the tools it was given', () => {
  test('a tool it was not given gets the words and does not run', async () => {
    filterToolsForAgent.mockResolvedValue(tools('recall'));
    callModel.mockResolvedValueOnce(asks('local_write_file', 'recall')).mockResolvedValueOnce(says('Made-up answer.'));
    const woke = await runWakeModel({
      agent: { id: 'made-up-scribe' }, systemPrompt: 'Made-up system words.', userPrompt: 'Made-up ask.',
      wakeId: 'made-up-wake', messageId: 'made-up-message', workspaceId: 'made-up-board', userId: PAT,
    });
    expect(ran()).toEqual(['recall']);
    expect(toolMessage(callModel.mock.calls[1][0].body.messages, 'made-up-call-0')).toBe(toolNotOfferedResult('local_write_file'));
    expect(woke.text).toBe('Made-up answer.');
  });
});

describe('a task handed to a helper agent runs only the tools the helper was given', () => {
  test('a tool the helper was not given gets the words, does not run, and the receipt says so', async () => {
    filterToolsForAgent.mockResolvedValue(tools('project_read'));
    callModel.mockResolvedValueOnce(asks('project_write', 'project_read'))
      .mockResolvedValueOnce(says('## Summary of Changes\n- Made up.\n## Verification Steps\n- Made up.'));
    await runTask({
      id: 'made-up-task', assignee_id: 'made-up-helper', title: 'Made-up task', prompt: 'Made-up ask.',
      priority: 'normal', workspace_id: 'made-up-board', created_by_user_id: PAT,
    });
    expect(ran()).toEqual(['project_read']);
    expect(toolMessage(callModel.mock.calls[1][0].body.messages, 'made-up-call-0')).toBe(toolNotOfferedResult('project_write'));
    const [, patch] = updateAgentTask.mock.calls[0];
    expect(patch.completion_receipt.tool_calls.map((c) => [c.tool, c.ok])).toEqual([['project_write', false], ['project_read', true]]);
  });
});
