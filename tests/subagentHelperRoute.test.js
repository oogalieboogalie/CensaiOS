import { jest } from '@jest/globals';
import request from 'supertest';

// "Start a helper" by hand (diagram 15): the data box form posts here and the
// same nano helper the start_helper tool runs does the job.

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn(), end: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: jest.fn(async (_db, { workspaceId }) => ({ id: workspaceId })),
}));
jest.unstable_mockModule('../server/memory.js', () => ({
  getSubAgentById: jest.fn(async (id) => (id === 'sub-1' ? { id, name: 'Scout', parent_id: 'nexus' } : null)),
}));
const handleStartHelper = jest.fn(async (_id, args) => (args.job === 'review'
  ? 'The review helper finished and was saved in your data box 001 as "helper review 21:50:00":\n\nLooks right.'
  : 'Pick one job for the helper: create, review, read, write, edit, search.'));
jest.unstable_mockModule('../server/tools/handlers/nanoHelper.js', () => ({ handleStartHelper }));

const { subagentHelperRouter } = await import('../server/routes/agents/subagentHelper.js');
const express = (await import('express')).default;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = req.get('x-user-id') ? { userId: Number(req.get('x-user-id')) } : {}; next(); });
app.use('/api', subagentHelperRouter);

describe('start a helper by hand', () => {
  test('runs the helper for the signed-in workspace and returns its answer', async () => {
    const res = await request(app).post('/api/sub-agents/sub-1/helper').set('x-user-id', '7')
      .send({ job: 'review', task: 'check the plan', input: 'step 1', workspaceId: 'w1' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/^The review helper finished/);
    expect(handleStartHelper).toHaveBeenCalledWith('sub-1', expect.objectContaining({ job: 'review', task: 'check the plan', input: 'step 1' }), { workspaceId: 'w1', userId: 7 });
  });

  test('says what is wrong when the job is not one of the six', async () => {
    const res = await request(app).post('/api/sub-agents/sub-1/helper').set('x-user-id', '7').send({ job: 'dance', task: 'x', workspaceId: 'w1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pick one job/);
  });

  test('turns away people who are not signed in, and unknown sub-agents', async () => {
    expect((await request(app).post('/api/sub-agents/sub-1/helper').send({ job: 'review', task: 'x', workspaceId: 'w1' })).status).toBe(401);
    expect((await request(app).post('/api/sub-agents/nope/helper').set('x-user-id', '7').send({ job: 'review', task: 'x', workspaceId: 'w1' })).status).toBe(404);
  });
});
