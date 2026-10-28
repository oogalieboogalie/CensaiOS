import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const callModel = jest.fn();
const logLines = [];

jest.unstable_mockModule('../server/db.js', () => ({ default: {} }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: async (_db, { userId }) => ({ id: `ws-${userId}` }),
}));
jest.unstable_mockModule('../server/aiGateway/index.js', () => ({
  callModel,
  createModelAccessContext: ctx => ctx,
  resolveChatModelConfig: ({ modelProvider, modelName }) => ({ provider: modelProvider || 'default', model: modelName || 'default-model' }),
}));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({ info: m => logLines.push(m), warn: m => logLines.push(m), error: m => logLines.push(m), debug: () => {} }),
}));

const { studioRouter, parseAssistReply } = await import('../server/routes/studio.js');

function app(userId = 7) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  a.use('/api/studio', studioRouter);
  return a;
}
const answer = content => ({ choices: [{ message: { content } }] });

beforeEach(() => { callModel.mockReset(); logLines.length = 0; });

test('asks the person\'s own model with the song context and returns only the Studio fields', async () => {
  callModel.mockResolvedValue(answer('```json\n{"say":"Added a gritty delay.","fx":[{"type":"saturation","params":{"drive":20}},{"type":"delay","params":{"feedback":60}}],"fxMode":"add","secret":"x"}\n```'));
  const res = await request(app()).post('/api/studio/assist').send({ prompt: 'Build a gritty delay and put it on this track', context: 'Song: 96 BPM' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ say: 'Added a gritty delay.', fxMode: 'add', model: 'default-model' });
  expect(res.body.fx.map(f => f.type)).toEqual(['saturation', 'delay']);
  expect(res.body.secret).toBeUndefined();
  const call = callModel.mock.calls[0][0];
  expect(call.accessContext).toMatchObject({ userId: 7, workspaceId: 'ws-7', source: 'studio-assist' });
  expect(call.body.messages[1].content).toContain('Song: 96 BPM');
  expect(call.body.messages[1].content).toContain('Request: Build a gritty delay');
  expect(logLines.join('\n')).toContain('assist: done (model default-model, 2 effects, 0 notes)');
  expect(logLines.join('\n')).not.toContain('gritty');
});

test('needs a signed-in person and a request', async () => {
  expect((await request(app(null)).post('/api/studio/assist').send({ prompt: 'x' })).status).toBe(401);
  expect((await request(app()).post('/api/studio/assist').send({ prompt: '  ' })).body.code).toBe('STUDIO_PROMPT_REQUIRED');
  expect((await request(app()).post('/api/studio/assist').send({ prompt: 'a'.repeat(601) })).status).toBe(413);
  expect(callModel).not.toHaveBeenCalled();
});

test('an answer that is not JSON is a clear 502, and a model failure logs only its code', async () => {
  callModel.mockResolvedValueOnce(answer('Sure! I would add some delay.'));
  const bad = await request(app()).post('/api/studio/assist').send({ prompt: 'delay please' });
  expect(bad.status).toBe(502);
  expect(bad.body.code).toBe('STUDIO_ASSIST_UNREADABLE');
  callModel.mockRejectedValueOnce(Object.assign(new Error('key sk-secret rejected'), { code: 'MODEL_KEY_MISSING', status: 400 }));
  const failed = await request(app()).post('/api/studio/assist').send({ prompt: 'delay please' });
  expect(failed.status).toBeGreaterThanOrEqual(400);
  expect(logLines.join('\n')).toContain('assist: failed (MODEL_KEY_MISSING)');
  expect(logLines.join('\n')).not.toContain('sk-secret');
});

test('parseAssistReply finds the JSON object inside chatter', () => {
  expect(parseAssistReply('Here you go: {"say":"ok"} done')).toEqual({ say: 'ok' });
  expect(parseAssistReply('[1,2]')).toBeNull();
  expect(parseAssistReply('')).toBeNull();
});
