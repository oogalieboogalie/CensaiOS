import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import { createFigmaFetch, FILE_URL } from './fixtures/figmaApi.js';

const callModel = jest.fn();
const getUserApiKeyConfig = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: async (_db, { userId }) => ({ id: `ws-${userId}` }),
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: (ctx) => ctx,
  resolveChatModelConfig: ({ modelProvider, modelName }) => ({ provider: modelProvider || 'default', model: modelName || 'default-model' }),
}));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({ getUserApiKeyConfig }));

const { designRouter } = await import('../server/routes/design.js');

function app(userId = 7) {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/design', designRouter);
  return a;
}

describe('design routes: Figma import', () => {
  const realFetch = global.fetch;
  let figma;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FIGMA_API_TOKEN;
    figma = createFigmaFetch();
    global.fetch = figma.fetchImpl;
  });
  afterAll(() => { global.fetch = realFetch; });

  test('status reports a connected BYOK token and never returns it', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_user_token' });
    const res = await request(app()).get('/api/design/figma/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true, source: 'byok', user: 'Alex Designer' });
    expect(JSON.stringify(res.body)).not.toContain('figd_user_token');
    expect(getUserApiKeyConfig).toHaveBeenCalledWith(7, 'figma');
  });

  test('status flags a saved token Figma rejects', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_revoked' });
    const res = await request(app()).get('/api/design/figma/status');
    expect(res.body).toEqual({ connected: false, source: 'byok', user: null, invalid: true });
  });

  test('without any token, frames is a clear 424', async () => {
    getUserApiKeyConfig.mockResolvedValue(null);
    const status = await request(app()).get('/api/design/figma/status');
    expect(status.body).toEqual({ connected: false, source: null, user: null });
    const res = await request(app()).get('/api/design/figma/frames').query({ url: FILE_URL });
    expect(res.status).toBe(424);
    expect(res.body.code).toBe('FIGMA_TOKEN_REQUIRED');
  });

  test('a link that is not a Figma file is a 400', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_user_token' });
    const res = await request(app()).get('/api/design/figma/frames').query({ url: 'https://example.com/design/x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FIGMA_URL_INVALID');
  });

  test('frames then import, end to end against the mocked Figma API', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_user_token' });
    const frames = await request(app()).get('/api/design/figma/frames').query({ url: FILE_URL });
    expect(frames.status).toBe(200);
    expect(frames.body.frames.map(f => f.name)).toEqual(['Hero', 'Pricing', 'Home / iPhone']);

    const imported = await request(app()).post('/api/design/figma/import').send({ url: FILE_URL, nodeId: '1:2' });
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({ name: 'Hero', width: 1440, height: 900, renderUrl: 'https://render.figma.example/1:2.png' });
    expect(imported.body.html).toContain('data-name="CTA button"');
    expect(figma.calls.every(c => c.headers['X-Figma-Token'] === 'figd_user_token')).toBe(true);
  });

  test('import uses the node from the link when no frame is picked', async () => {
    getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_user_token' });
    const res = await request(app()).post('/api/design/figma/import').send({ url: FILE_URL });
    expect(res.status).toBe(200);
    expect(res.body.nodeId).toBe('1:2');
  });
});

describe('design routes: remix with any model', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sends the code and request to the chosen model and returns the new code', async () => {
    callModel.mockResolvedValue({ choices: [{ message: { content: 'Here you go:\n```html\n<main class="dark">Hi</main>\n```' } }] });
    const res = await request(app()).post('/api/design/remix').send({
      source: '<main>Hi</main>', sourceType: 'html', instruction: 'make it dark',
      modelProvider: 'openrouter', modelName: 'anthropic/claude-sonnet-4.5', workspaceId: 'ws-x',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ source: '<main class="dark">Hi</main>', sourceType: 'html', model: 'anthropic/claude-sonnet-4.5', provider: 'openrouter' });
    const call = callModel.mock.calls[0][0];
    expect(call.accessContext).toEqual({ userId: 7, workspaceId: 'ws-7', source: 'design-remix' });
    expect(call.config).toEqual({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' });
    expect(call.body.messages[1].content).toContain('Change request: make it dark');
    expect(call.body.messages[1].content).toContain('<main>Hi</main>');
  });

  test('validates input and requires a session', async () => {
    expect((await request(app()).post('/api/design/remix').send({ source: '', instruction: 'x' })).body.code).toBe('REMIX_SOURCE_REQUIRED');
    expect((await request(app()).post('/api/design/remix').send({ source: '<p/>', instruction: ' ' })).body.code).toBe('REMIX_INSTRUCTION_REQUIRED');
    expect((await request(app(null)).post('/api/design/remix').send({ source: '<p/>', instruction: 'x' })).status).toBe(401);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('an empty model reply is a 502, not a blanked design', async () => {
    callModel.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });
    const res = await request(app()).post('/api/design/remix').send({ source: '<p>a</p>', instruction: 'x' });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('REMIX_EMPTY');
  });
});
