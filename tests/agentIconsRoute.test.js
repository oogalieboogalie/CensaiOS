import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const callModel = jest.fn();

jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: () => null,
  resolveChatModelConfig: () => ({ model: 'google/gemini-3.8-flash' }),
  workspaceUsageSink: null,
}));

const { agentIconsRouter } = await import('../server/routes/agentIcons.js');
const { extractSvgMarkup } = await import('../server/routes/agentIcons.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.session = { userId: 7 };
    next();
  });
  a.use('/api/agent-icons', agentIconsRouter);
  return a;
}

const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/></svg>';

describe('agent icon generation route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CENSAAI_AGENT_ICON_GENERATOR = '1';
  });

  afterEach(() => {
    delete process.env.CENSAAI_AGENT_ICON_GENERATOR;
  });

  test('returns extracted SVG from model output', async () => {
    callModel.mockResolvedValue({
      choices: [{ message: { content: `Here you go:\n${VALID_SVG}\nEnjoy!` } }],
    });
    const res = await request(app())
      .post('/api/agent-icons/generate')
      .send({ prompt: 'a compass rose', kind: 'atlas' });
    expect(res.status).toBe(200);
    expect(res.body.svg).toBe(VALID_SVG);
  });

  test('rejects missing prompt', async () => {
    const res = await request(app()).post('/api/agent-icons/generate').send({ prompt: '  ' });
    expect(res.status).toBe(400);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('403 when the server flag is off', async () => {
    delete process.env.CENSAAI_AGENT_ICON_GENERATOR;
    const res = await request(app())
      .post('/api/agent-icons/generate')
      .send({ prompt: 'a compass rose' });
    expect(res.status).toBe(403);
    expect(callModel).not.toHaveBeenCalled();
  });

  test('502 when the model returns no SVG', async () => {
    callModel.mockResolvedValue({ choices: [{ message: { content: 'sorry, no icon today' } }] });
    const res = await request(app())
      .post('/api/agent-icons/generate')
      .send({ prompt: 'a compass rose' });
    expect(res.status).toBe(502);
  });
});

describe('extractSvgMarkup', () => {
  test('pulls the svg block out of chatty output', () => {
    expect(extractSvgMarkup(`text\n${VALID_SVG}\nmore`)).toBe(VALID_SVG);
  });

  test('returns null without svg or when oversized', () => {
    expect(extractSvgMarkup('no svg here')).toBeNull();
    expect(extractSvgMarkup(`<svg>${'x'.repeat(25_000)}</svg>`)).toBeNull();
  });
});
