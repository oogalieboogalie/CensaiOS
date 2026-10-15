import { jest } from '@jest/globals';

// The Image window (/api/image) spends the caller's own Google key. The
// computer owner's key in .env is only for the owner: a teammate on a shared
// board is asked for their own key and never spends the owner's credit.

const callModel = jest.fn();
const createModelAccessContext = jest.fn(input => ({ verified: input }));
const resolveImageGenerationModelConfig = jest.fn(() => ({
  provider: 'google',
  model: 'gemini-image',
  apiKey: 'owner-env-gemini-key',
}));
const getUserApiKeyConfig = jest.fn(async () => null);
const dbQuery = jest.fn();
const resolveWorkspaceContext = jest.fn(async (_db, { workspaceId }) => ({ id: workspaceId || 'home-ws' }));

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext,
  EMBEDDING_MODEL_KIND: 'embedding',
  IMAGE_GENERATION_MODEL_KIND: 'image.generation',
  resolveEmbeddingModelConfig: jest.fn(),
  resolveImageGenerationModelConfig,
  resolveChatModelConfig: jest.fn(),
  workspaceUsageSink: jest.fn(),
}));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: jest.fn(),
}));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: dbQuery } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext, requireWorkspaceMember: jest.fn() }));

const { handleImageGen } = await import('../server/routes/chat/handlers.js');
const { mayUseServerKeys } = await import('../server/security/serverKeys.js');

const IMAGE = { candidates: [{ content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/webp' } }] } }] };
const prevMode = process.env.CENSAI_MODE;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CENSAI_MODE = 'local_desktop';
  callModel.mockResolvedValue(IMAGE);
  getUserApiKeyConfig.mockResolvedValue(null);
});

afterAll(() => {
  if (prevMode === undefined) delete process.env.CENSAI_MODE; else process.env.CENSAI_MODE = prevMode;
});

function mockResponse() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

async function draw(session, body = { prompt: 'draw a launch screen' }) {
  const res = mockResponse();
  await handleImageGen({ body, session }, res);
  return res;
}

const OWNER = { userId: 1, userRole: 'admin' };
const TEAMMATE = { userId: 2, userRole: 'user' };

describe('image route gateway integration', () => {
  test('returns 400 when prompt is missing', async () => {
    const res = await draw(OWNER, {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing prompt' });
    expect(callModel).not.toHaveBeenCalled();
  });

  test('asks for sign-in when nobody is signed in', async () => {
    const res = await draw(undefined);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('the owner still makes images with the key in .env, through callModel', async () => {
    const res = await draw(OWNER);

    expect(resolveImageGenerationModelConfig).toHaveBeenCalledWith({ modelProvider: 'google' });
    expect(createModelAccessContext).toHaveBeenCalledWith({ userId: 1, workspaceId: 'home-ws', source: 'image-generation' });
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      accessContext: { verified: { userId: 1, workspaceId: 'home-ws', source: 'image-generation' } },
      kind: 'image.generation',
      config: expect.objectContaining({ model: 'gemini-image', apiKey: 'owner-env-gemini-key' }),
      body: {
        model: 'gemini-image',
        prompt: 'draw a launch screen',
      },
      logContext: { source: 'image-generation' },
      usageAttribution: { workspaceId: 'home-ws', actor: { kind: 'user', id: 1 }, source: 'image-generation' },
    }));
    expect(res.json).toHaveBeenCalledWith({ image: 'data:image/webp;base64,abc' });
  });

  test('a teammate without a key cannot spend the owner\'s key and is asked for their own', async () => {
    const res = await draw(TEAMMATE);

    expect(callModel).not.toHaveBeenCalled();
    expect(getUserApiKeyConfig).toHaveBeenCalledWith(2, 'google');
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ code: 'MODEL_KEY_MISSING', keyProvider: 'google' });
    expect(body.error).toMatch(/Google Gemini key/);
    expect(JSON.stringify(body)).not.toContain('owner-env-gemini-key');
  });

  test('a teammate with their own Google key spends only that key', async () => {
    getUserApiKeyConfig.mockImplementation(async (userId, provider) => (
      userId === 2 && provider === 'google' ? { apiKey: 'teammate-key', modelName: 'gemini-2.5-flash' } : null
    ));

    const res = await draw(TEAMMATE, { prompt: 'a cat', workspaceId: 'shared-board' });

    expect(callModel).toHaveBeenCalledTimes(1);
    const call = callModel.mock.calls[0][0];
    expect(call.config).toMatchObject({ apiKey: 'teammate-key', model: 'gemini-image' });
    expect(call.usageAttribution).toMatchObject({ workspaceId: 'shared-board', actor: { kind: 'user', id: 2 } });
    expect(res.json).toHaveBeenCalledWith({ image: 'data:image/webp;base64,abc' });
  });

  test('a teammate cannot reach a workspace they are not in', async () => {
    resolveWorkspaceContext.mockRejectedValueOnce(Object.assign(new Error('nope'), { statusCode: 403 }));

    const res = await draw(TEAMMATE, { prompt: 'a cat', workspaceId: 'owner-only' });

    expect(callModel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('without a role in the session, the role is read from the account', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    await draw({ userId: 1 });
    expect(callModel.mock.calls[0][0].config.apiKey).toBe('owner-env-gemini-key');

    callModel.mockClear();
    dbQuery.mockResolvedValueOnce({ rows: [{ role: 'user' }] });
    const res = await draw({ userId: 2 });
    expect(callModel).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('who may spend the server keys', () => {
  test('local install: only the owner', async () => {
    expect(await mayUseServerKeys({ userId: 1, userRole: 'admin' }, { mode: 'local_desktop' })).toBe(true);
    expect(await mayUseServerKeys({ userId: 2, userRole: 'user' }, { mode: 'local_desktop' })).toBe(false);
    expect(await mayUseServerKeys({ userId: 3, userRole: 'guest' }, { mode: 'local_desktop' })).toBe(false);
  });

  test('a failed role lookup never opens the owner\'s keys', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('db down')) };
    expect(await mayUseServerKeys({ userId: 2 }, { mode: 'local_desktop', db })).toBe(false);
  });

  test('cloud: only admins and operators; a private team server keeps its managed keys', async () => {
    expect(await mayUseServerKeys({ userId: 2, userRole: 'user' }, { mode: 'cloud_saas' })).toBe(false);
    expect(await mayUseServerKeys({ userId: 1, userRole: 'operator' }, { mode: 'cloud_saas' })).toBe(true);
    expect(await mayUseServerKeys({}, { mode: 'cloud_saas' })).toBe(false);
    expect(await mayUseServerKeys({ userId: 2, userRole: 'user' }, { mode: 'private_server' })).toBe(true);
  });
});
