import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const callModel = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: async (_db, { userId }) => ({ id: `ws-${userId}` }),
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: async () => null,
  getSubAgentById: async () => null,
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: (ctx) => ctx,
  resolveChatModelConfig: ({ modelProvider, modelName } = {}) => ({ provider: modelProvider || 'default', model: modelName || 'default-model' }),
}));

const { modulesRouter } = await import('../server/routes/modules.js');
const { sketchProblem } = await import('../server/modules/sketch.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GOOD = '```json\n{"name":"Signup form","icon":"Toolbox","size":{"w":400,"h":500},"permissions":[]}\n```\n\n```html\n<form><input name="a"></form>\n```';

function app() {
  const a = express();
  a.use(express.json({ limit: '10mb' }));
  a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  a.use('/api/modules', modulesRouter);
  return a;
}

describe('Make real (spec 9)', () => {
  beforeEach(() => callModel.mockReset());

  test('the sketch goes to a vision model as an image part', async () => {
    callModel.mockImplementationOnce(async () => ({ choices: [{ message: { content: GOOD } }] }));
    const res = await request(app()).post('/api/modules/generate')
      .send({ request: 'Make this sketch real', sketch: PNG, modelProvider: 'openai', modelName: 'gpt-4o' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"done"');
    const messages = callModel.mock.calls[0][0].body.messages;
    const last = messages[messages.length - 1];
    expect(Array.isArray(last.content)).toBe(true);
    expect(last.content[0].text).toMatch(/hand-drawn sketch/);
    expect(last.content[1]).toEqual({ type: 'image_url', image_url: { url: PNG } });
  });

  test('a model without image input gets a plain reason, not a broken build', async () => {
    const res = await request(app()).post('/api/modules/generate')
      .send({ request: 'Make this sketch real', sketch: PNG, modelProvider: 'cohere', modelName: 'command-r' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MODULE_SKETCH_NEEDS_VISION');
    expect(callModel).not.toHaveBeenCalled();
  });

  test('only image data URLs are accepted', () => {
    const vision = { provider: 'openai', model: 'gpt-4o' };
    expect(sketchProblem('https://example.com/x.png', vision).code).toBe('MODULE_SKETCH_INVALID');
    expect(sketchProblem('data:text/html;base64,PGgxPg==', vision).code).toBe('MODULE_SKETCH_INVALID');
    expect(sketchProblem(PNG, vision)).toBeNull();
  });

  test('requests without a sketch are unchanged', async () => {
    callModel.mockImplementationOnce(async () => ({ choices: [{ message: { content: GOOD } }] }));
    await request(app()).post('/api/modules/generate').send({ request: 'a signup form' });
    const messages = callModel.mock.calls[0][0].body.messages;
    expect(typeof messages[messages.length - 1].content).toBe('string');
  });
});
