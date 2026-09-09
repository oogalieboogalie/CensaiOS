import { jest } from '@jest/globals';

const logConversation = jest.fn().mockResolvedValue();
const runHealingCascadeIfMentioned = jest.fn().mockResolvedValue();
const getAgentsByIds = jest.fn().mockResolvedValue([{ id: 'atlas' }]);
const buildSystemPrompt = jest.fn().mockResolvedValue('Scoped prompt');
const pool = { query: jest.fn(), on: jest.fn(), end: jest.fn() };
const runChatLoop = jest.fn().mockResolvedValue({ finalText: 'Scoped reply', toolActions: [] });
const callModel = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Group reply' } }] });
const createModelAccessContext = jest.fn(input => ({ verified: input }));
const resolveWorkspaceContext = jest.fn().mockResolvedValue({ id: 'workspace-owner' });
const dbReady = jest.fn(() => true);

jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady }));
jest.unstable_mockModule('../server/memory.js', () => ({
  logConversation,
  runHealingCascadeIfMentioned,
  getAgentsByIds,
  buildSystemPrompt,
}));
jest.unstable_mockModule('../server/routes/chat/shared.js', () => ({
  getApiKey: () => 'key',
  publicToolActions: value => value,
  publicTimings: value => value,
}));
jest.unstable_mockModule('../server/routes/chat/chatContext.js', () => ({
  prepareChatContext: jest.fn().mockResolvedValue({
    reqModel: 'model', reqBaseUrl: 'http://model', reqApiKey: 'key', reqProvider: 'test',
    chatMessages: [], toolsForCaller: [], changeImpact: null, projectContext: [],
    workspaceId: 'workspace-owner',
  }),
}));
jest.unstable_mockModule('../server/routes/chat/chatExecution.js', () => ({ runChatLoop }));
jest.unstable_mockModule('../server/operational-intelligence/traces.js', () => ({
  createSessionTrace: jest.fn().mockResolvedValue({ id: 'trace-1' }),
  finalizeTrace: jest.fn().mockResolvedValue(),
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext,
  IMAGE_GENERATION_MODEL_KIND: 'image',
  resolveChatModelConfig: () => ({ model: 'model', baseUrl: 'http://model', apiKey: 'key', provider: 'test' }),
  resolveImageGenerationModelConfig: () => ({}),
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext,
}));

const { handleChat } = await import('../server/routes/chat/main.js');
const { handleGroupChat, handleIdeaExpand } = await import('../server/routes/chat/handlers.js');

function responseDouble() {
  return {
    json: jest.fn(),
    status: jest.fn(function status() { return this; }),
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
}

describe('chat memory tenancy propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbReady.mockReturnValue(true);
  });

  test('direct chat logs and healing retain the authorized workspace and user', async () => {
    const req = {
      body: { agentId: 'atlas', workspaceId: 'spoof-replaced', messages: [{ from: 'me', text: 'Remember this.' }] },
      session: { userId: 7, userRole: 'user' },
    };
    await handleChat(req, responseDouble());

    expect(logConversation).toHaveBeenNthCalledWith(1, 'atlas', 'user', 'Remember this.', {
      workspaceId: 'workspace-owner', userId: 7,
    });
    expect(logConversation).toHaveBeenNthCalledWith(2, 'atlas', 'assistant', 'Scoped reply', {
      workspaceId: 'workspace-owner', userId: 7,
    });
    expect(runHealingCascadeIfMentioned).toHaveBeenCalledWith('Remember this.', 'user:7', {
      workspaceId: 'workspace-owner', userId: 7,
    });
  });

  test('group chat prompt assembly carries the authenticated user and resolved workspace', async () => {
    const req = {
      body: {
        agentIds: ['atlas'], workspaceId: 'workspace-owner', userId: 999,
        messages: [{ from: 'me', text: 'Plan.' }],
      },
      session: { userId: 7 },
    };
    await handleGroupChat(req, responseDouble());

    expect(buildSystemPrompt).toHaveBeenCalledWith('atlas', 'Plan.', {
      workspaceId: 'workspace-owner', userId: 7,
    });
    expect(createModelAccessContext).toHaveBeenCalledWith({
      userId: 7, workspaceId: 'workspace-owner', source: 'group-chat',
    });
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      accessContext: createModelAccessContext.mock.results[0].value,
    }));
  });

  test('idea expansion authorizes the workspace and ignores caller-supplied user identity', async () => {
    const req = {
      body: { ideas: ['Ship it'], workspaceId: 'workspace-requested', userId: 999 },
      session: { userId: 7 },
    };
    const res = responseDouble();

    await handleIdeaExpand(req, res);

    expect(resolveWorkspaceContext).toHaveBeenCalledWith(pool, {
      userId: 7, workspaceId: 'workspace-requested',
    });
    expect(createModelAccessContext).toHaveBeenCalledWith({
      userId: 7, workspaceId: 'workspace-owner', source: 'idea-expand',
    });
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      accessContext: createModelAccessContext.mock.results[0].value,
    }));
  });

  test('idea expansion preserves model-access status, code, and retry metadata', async () => {
    callModel.mockRejectedValueOnce(Object.assign(new Error('Free AI request allowance reached'), {
      statusCode: 429, code: 'FREE_TIER_USER_DAILY_LIMIT', retryAfter: 17,
    }));
    const res = responseDouble();

    await handleIdeaExpand({
      body: { ideas: ['Ship it'], workspaceId: 'workspace-owner' },
      session: { userId: 7 },
    }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '17');
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Free AI request allowance reached',
      code: 'FREE_TIER_USER_DAILY_LIMIT',
      retryAfter: 17,
    });
  });

  test('group chat returns model-access errors instead of an empty success', async () => {
    callModel.mockRejectedValueOnce(Object.assign(new Error('Free AI request allowance reached'), {
      name: 'ModelAccessError', statusCode: 429,
      code: 'FREE_TIER_SHARED_DAILY_LIMIT', retryAfter: 23,
    }));
    const res = responseDouble();

    await handleGroupChat({
      body: { agentIds: ['atlas'], workspaceId: 'workspace-owner', messages: [] },
      session: { userId: 7 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '23');
    expect(res.json).toHaveBeenCalledWith({
      error: 'Free AI request allowance reached',
      code: 'FREE_TIER_SHARED_DAILY_LIMIT',
      retryAfter: 23,
    });
  });

  test('group chat rejects non-family agent ids before provider work', async () => {
    const res = responseDouble();

    await handleGroupChat({
      body: { agentIds: ['guardian'], workspaceId: 'workspace-owner', messages: [] },
      session: { userId: 7 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'FAMILY_AGENT_NOT_FOUND',
    }));
    expect(callModel).not.toHaveBeenCalled();
  });

  test('group chat rejects missing canonical rows before provider work', async () => {
    getAgentsByIds.mockResolvedValueOnce([]);
    const res = responseDouble();

    await handleGroupChat({
      body: { agentIds: ['atlas'], workspaceId: 'workspace-owner', messages: [] },
      session: { userId: 7 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'FAMILY_AGENT_UNAVAILABLE',
    }));
    expect(callModel).not.toHaveBeenCalled();
  });

  test('group chat fails closed when the context database is unavailable', async () => {
    dbReady.mockReturnValue(false);
    const res = responseDouble();

    await handleGroupChat({
      body: { agentIds: ['atlas'], workspaceId: 'workspace-owner', messages: [] },
      session: { userId: 7 },
    }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'AGENT_CONTEXT_UNAVAILABLE',
    }));
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
  });
});
