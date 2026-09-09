import {
  callModel,
  consumeFreeTierAllowance,
  createModelAccessContext,
  db,
  EMBEDDING_MODEL_KIND,
  featureEnabled,
  getRuntimeMode,
  getSecret,
  getUserApiKeyConfig,
  ModelAccessError,
  releaseFreeTierAllowance,
  requestChatCompletion,
  requestEmbedding,
  requireWorkspaceMember,
  reserveFreeTierAllowance,
  resetAccessHarness,
} from './support/modelAccessHarness.js';

const priorFlag = process.env.CENSAI_FEATURE_FREE_AI_TIER;

function context(overrides = {}) {
  return createModelAccessContext({
    userId: 'user-a',
    workspaceId: 'workspace-a',
    source: 'chat',
    ...overrides,
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

describe('free-tier policy at the callModel chokepoint', () => {
  test('feature off preserves the existing path with no new identity, secret, BYOK, or ledger work', async () => {
    featureEnabled.mockReturnValue(false);
    getRuntimeMode.mockReturnValue('local_desktop');

    await expect(callModel({ body: { messages: [] } })).resolves.toMatchObject({ choices: expect.any(Array) });

    expect(getSecret).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(requireWorkspaceMember).not.toHaveBeenCalled();
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
    expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
    expect(requestChatCompletion).toHaveBeenCalledTimes(1);
  });

  test('an opt-in outside cloud mode also preserves the existing path', async () => {
    getRuntimeMode.mockReturnValue('private_server');

    await expect(callModel({ body: { messages: [] } })).resolves.toMatchObject({ choices: expect.any(Array) });
    expect(getSecret).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
  });

  test.each(['chat', 'task-worker', 'agent-wakeup'])(
    'feature-off cloud %s denies server-funded access before provider work',
    async (source) => {
      featureEnabled.mockReturnValue(false);

      await expect(callModel(request({
        accessContext: context({ source }),
      }))).rejects.toMatchObject({
        code: 'MODEL_ACCESS_PERSONAL_KEY_REQUIRED', status: 403,
      });

      expect(getUserApiKeyConfig).toHaveBeenCalledWith('user-a', 'openrouter');
      expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
      expect(requestChatCompletion).not.toHaveBeenCalled();
    },
  );

  test('enabled cloud rejects unbranded caller identity before database or provider work', async () => {
    await expect(callModel(request({
      accessContext: { userId: 'user-a', workspaceId: 'workspace-a', source: 'chat' },
    }))).rejects.toMatchObject({
      code: 'MODEL_ACCESS_CONTEXT_REQUIRED',
      status: 403,
    });

    expect(db.query).not.toHaveBeenCalled();
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
    expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
    expect(requestChatCompletion).not.toHaveBeenCalled();
  });

  test('re-verifies identity, reserves once, forces the platform route, and consumes valid output', async () => {
    const result = await callModel(request({
      retry: { maxRetries: 3 },
      usageAttribution: { workspaceId: 'spoofed', source: 'spoofed' },
    }));

    expect(result.choices[0].message.content).toBe('hello');
    expect(db.query).toHaveBeenCalledWith('SELECT role FROM users WHERE id = $1', ['user-a']);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(db, {
      userId: 'user-a', workspaceId: 'workspace-a',
    });
    expect(getUserApiKeyConfig).toHaveBeenCalledWith('user-a', 'openrouter');
    expect(reserveFreeTierAllowance).toHaveBeenCalledTimes(1);
    expect(getSecret).toHaveBeenCalledWith('OPENROUTER_API_KEY');
    expect(JSON.stringify(reserveFreeTierAllowance.mock.calls)).not.toContain('platform-key');
    expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      config: {
        provider: 'openrouter', model: 'openrouter/free',
        baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'platform-key',
      },
      body: expect.objectContaining({ model: 'openrouter/free' }),
      retry: { maxRetries: 0 },
      usageAttribution: {
        workspaceId: 'workspace-a', actor: { kind: 'user', id: 'user-a' }, source: 'chat',
      },
    }));
    expect(consumeFreeTierAllowance).toHaveBeenCalledTimes(1);
    expect(releaseFreeTierAllowance).not.toHaveBeenCalled();
  });

  test('quota denial returns a stable 429 and sends zero provider requests', async () => {
    const resetsAt = new Date(Date.now() + 30_000).toISOString();
    reserveFreeTierAllowance.mockResolvedValueOnce({
      allowed: false,
      dispatchAllowed: false,
      code: 'FREE_TIER_USER_DAILY_LIMIT',
      status: { user: { resetsAt }, shared: { resetsAt }, minute: { resetsAt } },
    });

    await expect(callModel(request())).rejects.toMatchObject({
      name: 'ModelAccessError',
      code: 'FREE_TIER_USER_DAILY_LIMIT',
      status: 429,
      retryAfter: expect.any(Number),
    });
    expect(requestChatCompletion).not.toHaveBeenCalled();
    expect(consumeFreeTierAllowance).not.toHaveBeenCalled();
  });

  test('ledger failure returns a stable 503 and sends zero provider requests', async () => {
    reserveFreeTierAllowance.mockRejectedValueOnce(new Error('database details'));

    await expect(callModel(request())).rejects.toMatchObject({
      code: 'FREE_TIER_LEDGER_UNAVAILABLE', status: 503, retryAfter: 5,
    });
    expect(requestChatCompletion).not.toHaveBeenCalled();
    expect(releaseFreeTierAllowance).not.toHaveBeenCalled();
  });

  test('denies shared-key embeddings before resolver or network work', async () => {
    await expect(callModel(request({
      kind: EMBEDDING_MODEL_KIND,
      body: { input: 'private embedding input' },
    }))).rejects.toMatchObject({ code: 'PLATFORM_MODEL_KIND_DENIED', status: 403 });
    expect(requestEmbedding).not.toHaveBeenCalled();
    expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
  });

  test('allows only a database-verified privileged role to bypass allowance', async () => {
    getSecret.mockImplementation(() => { throw new Error('platform key unavailable'); });
    db.query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

    await expect(callModel(request())).resolves.toMatchObject({ choices: expect.any(Array) });
    expect(requestChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ model: 'requested-paid-model' }),
    }));
    expect(getUserApiKeyConfig).not.toHaveBeenCalled();
    expect(reserveFreeTierAllowance).not.toHaveBeenCalled();
    expect(getSecret).not.toHaveBeenCalled();
  });

  test('exports a typed stable access error', () => {
    expect(new ModelAccessError('CODE', 'message', 503, 5)).toMatchObject({
      code: 'CODE', status: 503, statusCode: 503, retryAfter: 5,
    });
  });
});
