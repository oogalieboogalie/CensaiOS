import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const callModel = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: async (_db, { userId }) => ({ id: `ws-${userId}` }),
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: async (id) => (id === 'censai' ? { model_provider: 'openrouter', model_name: 'chat/model' } : null),
  getSubAgentById: async () => null,
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: (ctx) => ctx,
  resolveChatModelConfig: ({ modelProvider, modelName } = {}) => ({ provider: modelProvider || 'default', model: modelName || 'default-model' }),
}));

const { modulesRouter } = await import('../server/routes/modules.js');

function app(userId = 7) {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/modules', modulesRouter);
  return a;
}

const GOOD = '```json\n{"name":"Tip calculator","icon":"Toolbox","size":{"w":400,"h":500},"permissions":[]}\n```\n\n```html\n<div id="x">ok</div>\n<script>censai.toast("hi")</script>\n```';

// A stand-in model: streams its reply in small chunks like a real provider.
function replies(...texts) {
  for (const text of texts) {
    callModel.mockImplementationOnce(async ({ onDelta }) => {
      for (let i = 0; i < text.length; i += 40) onDelta?.(text.slice(i, i + 40));
      return { choices: [{ message: { content: text } }] };
    });
  }
}

function events(res) {
  return res.text.trim().split('\n').map(line => JSON.parse(line));
}

beforeEach(() => callModel.mockReset());

test('generate streams the code and finishes with a module', async () => {
  replies(GOOD);
  const res = await request(app()).post('/api/modules/generate').send({ request: 'a tip calculator for my crew', workspaceId: 'w1' });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/ndjson/);
  const list = events(res);
  expect(list.filter(e => e.type === 'delta').map(e => e.text).join('')).toBe(GOOD);
  expect(list.at(-1)).toMatchObject({ type: 'done', manifest: { name: 'Tip calculator' }, source: expect.stringContaining('id="x"'), attempts: 1 });
  const call = callModel.mock.calls[0][0];
  expect(call.accessContext).toMatchObject({ userId: 7, workspaceId: 'ws-7', source: 'module-generate' });
  expect(call.body.messages[0].content).toMatch(/You build censaiOS modules/);
  // Built on the default chat agent's model, the one the person already uses.
  expect(call.config).toEqual({ provider: 'openrouter', model: 'chat/model' });
});

test('a reply that is not a module goes back to the model once with the error', async () => {
  replies('Sure! Here is your app: <div>no fences</div>', GOOD);
  const res = await request(app()).post('/api/modules/generate').send({ request: 'a tip calculator' });
  const list = events(res);
  expect(list.some(e => e.type === 'retry' && e.attempt === 2)).toBe(true);
  expect(list.at(-1)).toMatchObject({ type: 'done', attempts: 2 });
  const second = callModel.mock.calls[1][0].body.messages.at(-1).content;
  expect(second).toMatch(/can't run/);
});

test('two bad replies end in a clear error event', async () => {
  replies('nope', '```html\n<script src="https://cdn.test/x.js"></script>\n```');
  const res = await request(app()).post('/api/modules/generate').send({ request: 'a tip calculator' });
  expect(events(res).at(-1)).toMatchObject({ type: 'error', code: 'MODULE_GENERATION_FAILED', error: expect.stringMatching(/External scripts/) });
});

test('edits send the current code and the change request', async () => {
  replies(GOOD);
  const res = await request(app()).post('/api/modules/generate').send({
    instruction: 'make the buttons bigger', source: '<div>old</div>', manifest: { name: 'Tip calculator' }, request: 'a tip calculator',
  });
  expect(events(res).at(-1).type).toBe('done');
  const user = callModel.mock.calls[0][0].body.messages.at(-1).content;
  expect(user).toContain('<div>old</div>');
  expect(user).toContain('Change request: make the buttons bigger');
  expect(callModel.mock.calls[0][0].accessContext.source).toBe('module-edit');
});

test('signed-out and empty requests are refused before any model call', async () => {
  expect((await request(app(null)).post('/api/modules/generate').send({ request: 'x' })).status).toBe(401);
  expect((await request(app()).post('/api/modules/generate').send({})).status).toBe(400);
  expect(callModel).not.toHaveBeenCalled();
});

test('a module asking an agent gets plain text back', async () => {
  callModel.mockResolvedValueOnce({ choices: [{ message: { content: ' [{"q":"a","a":"b"}] ' } }] });
  const res = await request(app()).post('/api/modules/ask').send({ prompt: 'Write cards', moduleName: 'Flash cards' });
  expect(res.body).toEqual({ text: '[{"q":"a","a":"b"}]' });
  expect(callModel.mock.calls[0][0].body.messages[0].content).toContain('"Flash cards"');
});

test('templates are the example modules', async () => {
  const res = await request(app()).get('/api/modules/templates');
  expect(res.body.templates.map(t => t.manifest.name)).toEqual(['Flash cards', 'Listing pipeline', 'Pomodoro timer', 'Tip calculator', 'Unit converter']);
});
