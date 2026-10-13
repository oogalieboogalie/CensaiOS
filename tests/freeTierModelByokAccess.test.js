import {
  callModel,
  consumeFreeTierAllowance,
  createModelAccessContext,
  featureEnabled,
  getSecret,
  getUserApiKeyConfig,
  inferUserApiKeyProvider,
  requestChatCompletion,
  reserveFreeTierAllowance,
  resetAccessHarness,
} from './support/modelAccessHarness.js';

const priorFlag = process.env.CENSAI_FEATURE_FREE_AI_TIER;

function context() {
  return createModelAccessContext({
    userId: 'user-a', workspaceId: 'workspace-a', source: 'chat',
  });
}

function request(overrides = {}) {
  return {
    modelProvider: 'openrouter',
    modelName: 'requested-paid-model',
    body: { model: 'caller-model', messages: [{ role: 'user', content: 'private' }] },
    accessContext: context(),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.CENSAI_FEATURE_FREE_AI_TIER = 'true';
  resetAccessHarness();
});

afterAll(() => {
  if (priorFlag === undefined) delete process.env.CENSAI_FEATURE_FREE_AI_TIER;
  else process.env.CENSAI_FEATURE_FREE_AI_TIER = priorFlag;
});

test('uses the exact stored user key and skips the platform allowance', async () => {
  getSecret.mockImplementation(() => { throw new Error('platform key unavailable'); });
  getUserApiKeyConfig.mockResolvedValueOnce({
    apiKey: 'exact-user-key', modelName: 'user-paid-model',
  });

  await callModel(request());

  expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({ apiKey: 'exact-user-key', model: 'user-paid-model' }),
    body: expect.objectContaining({ model: 'user-paid-model' }),
  }));
  expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
  expect(consumeFreeTierAllowance).not.toHaveBeenCalled();
  expect(getSecret).not.toHaveBeenCalled();
});

test('feature-off cloud uses exact BYOK without a platform allowance', async () => {
  featureEnabled.mockReturnValue(false);
  getUserApiKeyConfig.mockResolvedValueOnce({
    apiKey: 'feature-off-user-key', modelName: 'user-paid-model',
  });

  await callModel(request());

  expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({ apiKey: 'feature-off-user-key', model: 'user-paid-model' }),
  }));
  expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
  expect(getSecret).not.toHaveBeenCalled();
});

test('uses an exact matching provider key before the OpenRouter free fallback', async () => {
  inferUserApiKeyProvider.mockReturnValueOnce('google');
  getUserApiKeyConfig.mockResolvedValueOnce({ apiKey: 'exact-google-key', modelName: null });

  await callModel(request({
    modelProvider: 'google',
    config: {
      provider: 'google', model: 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'server-key',
    },
    body: { model: 'gemini-2.5-flash', messages: [] },
  }));

  expect(getUserApiKeyConfig).toHaveBeenCalledTimes(1);
  expect(getUserApiKeyConfig).toHaveBeenCalledWith('user-a', 'google');
  expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
    config: expect.objectContaining({
      provider: 'google', model: 'gemini-2.5-flash', apiKey: 'exact-google-key',
    }),
  }));
  expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
});

test('routes mixed-provider chat through the user OpenRouter key and forced free model', async () => {
  inferUserApiKeyProvider.mockReturnValueOnce('google');
  getUserApiKeyConfig
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ apiKey: 'user-openrouter-key', modelName: 'paid-model-ignored' });

  await callModel(request({
    modelProvider: 'google',
    config: {
      provider: 'google', model: 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'server-key',
    },
    body: { model: 'gemini-2.5-flash', messages: [] },
    retry: { maxRetries: 4 },
  }));

  expect(getUserApiKeyConfig.mock.calls).toEqual([
    ['user-a', 'google'], ['user-a', 'openrouter'],
  ]);
  expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
    config: {
      provider: 'openrouter', model: 'openrouter/free',
      baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'user-openrouter-key',
    },
    body: expect.objectContaining({ model: 'openrouter/free' }),
    retry: { maxRetries: 0 },
  }));
  expect(JSON.stringify(requestChatCompletion.mock.calls)).not.toContain('paid-model-ignored');
  expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
  expect(getSecret).not.toHaveBeenCalled();
});
