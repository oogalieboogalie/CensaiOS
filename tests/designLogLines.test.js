// Figma import and Design remix each leave one 'design' app log line: file
// key, frame count or frame, fidelity, model, worked or why not. Never the
// Figma token, the design's text or what was asked of the model.
import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import { createFigmaFetch, FILE_URL } from './fixtures/figmaApi.js';

const callModel = jest.fn();
const getUserApiKeyConfig = jest.fn();
const logged = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => ({
    info: (m) => logged.push([name, 'info', m]), warn: (m) => logged.push([name, 'warn', m]),
    error: () => {}, debug: () => {},
  }),
}));
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

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
app.use('/api/design', designRouter);

const lines = () => logged.filter(([name]) => name === 'design').map(([, level, line]) => `${level} ${line}`);
const realFetch = global.fetch;
beforeEach(() => {
  logged.length = 0;
  global.fetch = createFigmaFetch().fetchImpl;
});
afterAll(() => { global.fetch = realFetch; });

test('list, import, refresh and remix leave four lines without the token or the design text', async () => {
  getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_user_token' });
  callModel.mockResolvedValue({ choices: [{ message: { content: '```html\n<main class="dark">Pat\'s hero</main>\n```' } }] });
  expect((await request(app).get('/api/design/figma/frames').query({ url: FILE_URL })).status).toBe(200);
  expect((await request(app).post('/api/design/figma/import').send({ url: FILE_URL, nodeId: '1:2' })).status).toBe(200);
  expect((await request(app).post('/api/design/figma/import').send({ url: FILE_URL, nodeId: '1:2', refresh: true })).status).toBe(200);
  expect((await request(app).post('/api/design/remix').send({ source: '<main>Pat\'s hero</main>', sourceType: 'html', instruction: 'make it dark for Sam', modelName: 'stand-in-model' })).status).toBe(200);
  const got = lines();
  expect(got).toHaveLength(4);
  expect(got[0]).toMatch(/^info list frames in file AbC123xyz: done \(\d+ frames\)$/);
  expect(got[1]).toMatch(/^info import file AbC123xyz frame 1:2: done \(fidelity (high|low), \d+ layers\)$/);
  expect(got[2]).toMatch(/^info refresh from Figma file AbC123xyz frame 1:2: done/);
  expect(got[3]).toBe('info remix a design: done (html code, model stand-in-model)');
  expect(JSON.stringify(logged)).not.toMatch(/figd_|Pat|Sam|make it dark|Hero/);
});

test('a token Figma rejects shows a refused line', async () => {
  getUserApiKeyConfig.mockResolvedValue({ apiKey: 'figd_revoked' });
  const res = await request(app).get('/api/design/figma/frames').query({ url: FILE_URL });
  expect(res.status).toBe(424);
  expect(lines()).toEqual(['warn list frames in file AbC123xyz: refused (Figma did not accept the token)']);
});

test('no token at all, and an empty model reply, each say why', async () => {
  getUserApiKeyConfig.mockResolvedValue(null);
  await request(app).post('/api/design/figma/import').send({ url: FILE_URL, nodeId: '1:2' });
  callModel.mockResolvedValue({ choices: [{ message: { content: ' ' } }] });
  await request(app).post('/api/design/remix').send({ source: '<p>a</p>', instruction: 'x' });
  expect(lines()).toEqual([
    'warn import file AbC123xyz frame 1:2: refused (no Figma token connected)',
    'warn remix a design: failed (the model returned no code)',
  ]);
});
