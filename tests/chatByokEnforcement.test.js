import { jest } from '@jest/globals';

const getAgent = jest.fn();
const getSubAgentById = jest.fn().mockResolvedValue(null);
const buildSystemPrompt = jest.fn().mockResolvedValue('agent prompt');
const getUserApiKeyConfig = jest.fn();
const resolveChatModelConfig = jest.fn();
const dbReady = jest.fn(() => true);

jest.unstable_mockModule('../server/dbState.js', () => ({
  dbReady,
}));

jest.unstable_mockModule('../server/workspaces.js', () => ({
  openProject: jest.fn(),
}));

jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent,
  getSubAgentById,
  buildSystemPrompt,
}));

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  resolveChatModelConfig,
  ModelAccessError: class ModelAccessError extends Error {
    constructor(code, message, statusCode, retryAfter = null) {
      super(message);
      Object.assign(this, { name: 'ModelAccessError', code, statusCode, status: statusCode, retryAfter });
    }
  },
}));

jest.unstable_mockModule('../server/tools.js', () => ({
  filterToolsForAgent: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query: jest.fn() },
}));

jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: jest.fn((provider, baseUrl) => (
    provider || (baseUrl.includes('openrouter.ai') ? 'openrouter' : null)
  )),
}));

jest.unstable_mockModule('../server/routes/chat/prompts.js', () => ({
  buildSubAgentSystemPrompt: jest.fn(),
}));

const { prepareChatContext } = await import('../server/routes/chat/chatContext.js');
const originalMode = process.env.HOMEBASE_MODE;
const originalFreeTierFlag = process.env.CENSAI_FEATURE_FREE_AI_TIER;

describe('chat BYOK enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HOMEBASE_MODE = 'cloud_saas';
    dbReady.mockReturnValue(true);
    delete process.env.CENSAI_FEATURE_FREE_AI_TIER;
    resolveChatModelConfig.mockReturnValue({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'server-paid-key',
    });
    getAgent.mockResolvedValue({
      id: 'censai',
      model_provider: 'openrouter',
      model_name: 'anthropic/claude-sonnet-4.5',
    });
  });

  afterAll(() => {
    if (originalMode === undefined) delete process.env.HOMEBASE_MODE;
    else process.env.HOMEBASE_MODE = originalMode;
    if (originalFreeTierFlag === undefined) delete process.env.CENSAI_FEATURE_FREE_AI_TIER;
    else process.env.CENSAI_FEATURE_FREE_AI_TIER = originalFreeTierFlag;
  });

  test('blocks a non-admin paid cloud model without a personal key', async () => {
    getUserApiKeyConfig.mockResolvedValue(null);

    await expect(prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    )).rejects.toMatchObject({
      code: 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED', statusCode: 403,
    });
  });

  test('uses the matching personal key and optional overrides', async () => {
    getUserApiKeyConfig.mockResolvedValue({
      apiKey: 'personal-key',
      modelName: 'openai/gpt-4.1',
    });

    const context = await prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    );

    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'openrouter');
    expect(context).toMatchObject({
      reqApiKey: 'personal-key',
      reqBaseUrl: 'https://openrouter.ai/api/v1',
      reqModel: 'openai/gpt-4.1',
    });
  });

  test('infers the credential provider for seeded agents without one', async () => {
    getAgent.mockResolvedValue({
      id: 'censai',
      model_provider: null,
      model_name: 'anthropic/claude-sonnet-4.5',
    });
    resolveChatModelConfig.mockReturnValue({
      provider: null,
      model: 'anthropic/claude-sonnet-4.5',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'server-paid-key',
    });
    getUserApiKeyConfig.mockResolvedValue({
      apiKey: 'personal-key',
      modelName: null,
    });

    const context = await prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    );

    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'openrouter');
    expect(context.reqApiKey).toBe('personal-key');
  });

  test('fails closed when personal-key verification errors', async () => {
    getUserApiKeyConfig.mockRejectedValue(new Error('database offline'));

    await expect(prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    )).rejects.toMatchObject({ code: 'MODEL_ACCESS_UNAVAILABLE', statusCode: 503 });
  });

  test('uses the server-managed provider route in local mode', async () => {
    process.env.HOMEBASE_MODE = 'local_desktop';
    getUserApiKeyConfig.mockResolvedValue(null);

    const context = await prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    );

    // Best-effort vault lookup runs everywhere; null falls back to server key.
    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'openrouter');
    expect(context.reqApiKey).toBe('server-paid-key');
  });

  test('vault key wins over the server key in local mode', async () => {
    process.env.HOMEBASE_MODE = 'local_desktop';
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'personal-key', modelName: null });

    const context = await prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    );

    expect(context.reqApiKey).toBe('personal-key');
  });

  test('defers cloud key and model enforcement to the central free-tier gateway when enabled', async () => {
    process.env.CENSAI_FEATURE_FREE_AI_TIER = 'true';
    getUserApiKeyConfig.mockResolvedValue(null);

    const context = await prepareChatContext(
      'censai',
      null,
      [{ from: 'me', text: 'hello' }],
      7,
      'user'
    );

    // Best-effort vault check runs first; null defers to the gateway.
    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'openrouter');
    expect(context).toMatchObject({
      reqModel: 'anthropic/claude-sonnet-4.5',
      reqBaseUrl: 'https://openrouter.ai/api/v1',
    });
  });

  test('hides a global non-family agent from an ordinary cloud user', async () => {
    getAgent.mockResolvedValue({
      id: 'guardian', model_provider: 'openrouter', model_name: 'openrouter/free',
    });

    await expect(prepareChatContext(
      'guardian', null, [{ from: 'me', text: 'hello' }], 7, 'user',
    )).rejects.toMatchObject({ code: 'FAMILY_AGENT_NOT_FOUND', statusCode: 404 });

    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
    expect(buildSystemPrompt).not.toHaveBeenCalled();
  });

  test('does not fall through to sub-agent chat when a canonical row is missing', async () => {
    getAgent.mockResolvedValue(null);

    await expect(prepareChatContext(
      'atlas', null, [{ from: 'me', text: 'hello' }], 7, 'user',
    )).rejects.toMatchObject({ code: 'FAMILY_AGENT_UNAVAILABLE', statusCode: 503 });

    expect(getSubAgentById).not.toHaveBeenCalled();
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
  });

  test('fails before agent or model-key work when the context database is unavailable', async () => {
    dbReady.mockReturnValue(false);

    await expect(prepareChatContext(
      'atlas', null, [{ from: 'me', text: 'hello' }], 7, 'user',
    )).rejects.toMatchObject({ code: 'AGENT_CONTEXT_UNAVAILABLE', statusCode: 503 });

    expect(getAgent).not.toHaveBeenCalled();
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
  });
});
