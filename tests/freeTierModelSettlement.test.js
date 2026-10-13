import {
  callModel,
  consumeFreeTierAllowance,
  createModelAccessContext,
  releaseFreeTierAllowance,
  requestChatCompletion,
  resetAccessHarness,
} from './support/modelAccessHarness.js';

const priorFlag = process.env.CENSAI_FEATURE_FREE_AI_TIER;

function request() {
  return {
    modelProvider: 'openrouter',
    modelName: 'requested-paid-model',
    body: { model: 'caller-model', messages: [{ role: 'user', content: 'private' }] },
    accessContext: createModelAccessContext({
      userId: 'user-a', workspaceId: 'workspace-a', source: 'chat',
    }),
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

test.each([
  [429, 'FREE_TIER_PROVIDER_RATE_LIMIT'],
  [503, 'FREE_TIER_PROVIDER_UNAVAILABLE'],
])('releases provider %s and preserves bounded status metadata', async (status, code) => {
  requestChatCompletion.mockRejectedValueOnce(Object.assign(new Error('private raw response'), {
    status,
    retryAfter: 7,
  }));

  await expect(callModel(request())).rejects.toMatchObject({ code, status, retryAfter: 7 });
  expect(releaseFreeTierAllowance).toHaveBeenCalledWith(expect.objectContaining({
    reasonCode: code,
    httpStatus: status,
    retryAfterSeconds: 7,
    attempts: 1,
  }));
  expect(JSON.stringify(releaseFreeTierAllowance.mock.calls)).not.toContain('private raw response');
});

test('rejects and releases a structurally invalid 2xx completion', async () => {
  requestChatCompletion.mockResolvedValueOnce({ choices: [] });

  await expect(callModel(request())).rejects.toMatchObject({
    code: 'FREE_TIER_INVALID_COMPLETION', status: 503,
  });
  expect(releaseFreeTierAllowance).toHaveBeenCalledWith(expect.objectContaining({
    reasonCode: 'FREE_TIER_INVALID_COMPLETION',
  }));
  expect(consumeFreeTierAllowance).not.toHaveBeenCalled();
});

test.each(['', '   \n\t'])('rejects and releases empty completion content %#', async content => {
  requestChatCompletion.mockResolvedValueOnce({
    choices: [{ message: { role: 'assistant', content } }],
  });

  await expect(callModel(request())).rejects.toMatchObject({
    code: 'FREE_TIER_INVALID_COMPLETION', status: 503,
  });
  expect(releaseFreeTierAllowance).toHaveBeenCalledWith(expect.objectContaining({
    reasonCode: 'FREE_TIER_INVALID_COMPLETION',
  }));
  expect(consumeFreeTierAllowance).not.toHaveBeenCalled();
});
