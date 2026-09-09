import { jest } from '@jest/globals';

// Real runTask + real buildCompletionReceipt, mocked model/tool/db layers:
// proves sub-agent completion receipts record per-tool ok flags the harness
// computed, on both the completed and failed paths.
jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn(async () => ({ rows: [] })) },
}));

const updateAgentTask = jest.fn(async () => ({}));
const getSubAgentById = jest.fn(async () => ({ id: 'sub1', name: 'minimax-worker' }));
jest.unstable_mockModule('../server/memory.js', async () => {
  const { buildCompletionReceipt } = await import('../server/memory/tasks/receipts.js');
  return {
    updateAgentTask,
    getSubAgentById,
    sendAgentMessage: jest.fn(async () => {}),
    buildCompletionReceipt,
  };
});

const callModel = jest.fn();
const createModelAccessContext = jest.fn(input => ({ verified: input }));
const filterToolsForAgent = jest.fn(async () => []);
jest.unstable_mockModule('../server/routes/chat/index.js', () => ({
  buildSubAgentSystemPrompt: jest.fn(async () => 'system prompt'),
  getSubAgentModelConfig: jest.fn(() => ({ modelName: 'm', baseUrl: 'http://stub', apiKey: 'k' })),
}));

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  aiGatewayLog: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  CHAT_COMPLETION_TIMEOUT_MS: 30000,
  DEFAULT_CHAT_BASE_URL: 'http://stub',
  DEFAULT_CHAT_MODEL: 'm',
  OLLAMA_CHAT_MODEL_ALIASES: [],
  getDefaultChatApiKey: jest.fn(() => 'k'),
  callModel,
  createModelAccessContext,
  workspaceUsageSink: jest.fn(),
}));

jest.unstable_mockModule('../server/tools.js', () => ({
  executeTool: jest.fn(async (agentId, toolName) =>
    toolName === 'mailcow_domains' ? 'Error: MAILCOW_URL not configured' : 'web results...'),
  filterToolsForAgent,
}));

jest.unstable_mockModule('../server/task-worker/batch.js', () => ({
  checkBatchCompletion: jest.fn(async () => {}),
}));

const { runTask } = await import('../server/task-worker/execution.js');

const toolCallTurn = {
  choices: [{
    message: {
      role: 'assistant',
      tool_calls: [
        { id: 'c1', function: { name: 'mailcow_domains', arguments: '{}' } },
        { id: 'c2', function: { name: 'web_search', arguments: '{"query":"censai"}' } },
      ],
    },
  }],
};

const task = {
  id: 't1', assignee_id: 'sub1', title: 'Check mail', prompt: 'do it', priority: 'normal',
  workspace_id: 'workspace-1', created_by_user_id: 7,
};

beforeEach(() => {
  updateAgentTask.mockClear();
  getSubAgentById.mockClear();
  filterToolsForAgent.mockClear();
  callModel.mockReset();
});

describe('runTask completion receipts record tool truth', () => {
  test('completed receipt carries per-tool ok flags', async () => {
    callModel
      .mockResolvedValueOnce(toolCallTurn)
      .mockResolvedValueOnce({ choices: [{ message: { content: '## Summary of Changes\n- looked at mail\n## Verification Steps\n- n/a' } }] });

    await runTask(task);

    expect(getSubAgentById).toHaveBeenCalledWith('sub1', { workspaceId: 'workspace-1', userId: 7 });
    expect(filterToolsForAgent).toHaveBeenCalledWith('sub1', { workspaceId: 'workspace-1', userId: 7 });

    expect(updateAgentTask).toHaveBeenCalledTimes(1);
    const [, patch] = updateAgentTask.mock.calls[0];
    expect(patch.status).toBe('completed');
    expect(patch.completion_receipt.status).toBe('completed');
    expect(patch.completion_receipt.tool_calls).toEqual([
      { tool: 'mailcow_domains', ok: false, ms: expect.any(Number), round: 1 },
      { tool: 'web_search', ok: true, ms: expect.any(Number), round: 1 },
    ]);
  });

  test('failed receipt keeps the tool calls made before the crash', async () => {
    callModel
      .mockResolvedValueOnce(toolCallTurn)
      .mockRejectedValueOnce(new Error('model exploded'));

    await runTask(task);

    expect(updateAgentTask).toHaveBeenCalledTimes(1);
    const [, patch] = updateAgentTask.mock.calls[0];
    expect(patch.status).toBe('failed');
    expect(patch.completion_receipt.status).toBe('failed');
    expect(patch.completion_receipt.summary).toEqual(['model exploded']);
    expect(patch.completion_receipt.tool_calls.map(c => [c.tool, c.ok])).toEqual([
      ['mailcow_domains', false],
      ['web_search', true],
    ]);
  });
});
