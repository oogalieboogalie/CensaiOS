import { jest } from '@jest/globals';

const callModel = jest.fn();
const createModelAccessContext = jest.fn();
const executeTool = jest.fn();
const filterToolsForAgent = jest.fn(async () => []);
const workspaceUsageSink = jest.fn();

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext,
  resolveChatModelConfig: jest.fn(() => ({
    provider: 'test', model: 'test-model', baseUrl: 'http://model', apiKey: 'key',
  })),
  workspaceUsageSink,
}));
jest.unstable_mockModule('../server/tools.js', () => ({
  executeTool,
  filterToolsForAgent,
}));

const { runWakeModel } = await import('../server/agent-wakeups/modelLoop.js');

const input = {
  agent: { id: 'atlas', model_provider: 'test', model_name: 'test-model' },
  systemPrompt: 'system',
  userPrompt: 'wake up',
  wakeId: 'wake-1',
  messageId: 'message-1',
  workspaceId: 'workspace-1',
  userId: 7,
};

beforeEach(() => {
  jest.clearAllMocks();
  createModelAccessContext.mockImplementation((value) => {
    if (!value.userId || !value.workspaceId) throw new TypeError('verified identity required');
    return { verified: value };
  });
  callModel.mockResolvedValue({ choices: [{ message: { content: 'Awake.' } }] });
});

test('agent wakeup uses the persisted user and workspace model-access scope', async () => {
  await expect(runWakeModel(input)).resolves.toEqual({ text: 'Awake.', toolCalls: [] });

  expect(createModelAccessContext).toHaveBeenCalledWith({
    userId: 7, workspaceId: 'workspace-1', source: 'agent-wakeup',
  });
  expect(filterToolsForAgent).toHaveBeenCalledWith('atlas', {
    workspaceId: 'workspace-1', userId: 7,
  });
  expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
    accessContext: createModelAccessContext.mock.results[0].value,
    usageAttribution: expect.objectContaining({
      workspaceId: 'workspace-1', actor: { kind: 'user', id: 7 }, source: 'agent-wakeup',
    }),
  }));
});

test('agent wakeup never brands a missing identity', async () => {
  await expect(runWakeModel({ ...input, userId: null })).rejects.toThrow('verified identity required');

  expect(callModel).not.toHaveBeenCalled();
});
