import { jest } from '@jest/globals';
import request from 'supertest';

const lines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (namespace) => {
    const write = (level) => (msg, meta) => lines.push({ namespace, level, msg, meta });
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {} };
  },
}));
const createSchedule = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext: async () => ({ id: 'workspace-1', role: 'member' }),
}));
jest.unstable_mockModule('../server/memory/schedules.js', () => ({
  createSchedule,
  deleteOwnedSchedule: jest.fn(),
  getSchedules: jest.fn(),
  updateOwnedSchedule: jest.fn(),
}));

const express = (await import('express')).default;
const { schedulesRouter } = await import('../server/routes/schedules.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  a.use('/api', schedulesRouter);
  return a;
}

beforeEach(() => { lines.length = 0; jest.clearAllMocks(); });

describe('schedule error answers', () => {
  test('a database fault answers a plain sentence and a short code, and logs no raw text', async () => {
    createSchedule.mockRejectedValue(Object.assign(
      new Error('insert or update on table "agent_schedules" violates foreign key constraint "pat_fk"'),
      { code: '23503' },
    ));
    const res = await request(app()).post('/api/schedules').send({ task_text: 'Water the plants for Pat' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'The schedule could not be changed. Try again in a moment.', code: '23503' });
    expect(lines).toEqual([{ namespace: 'scheduler', level: 'error', msg: 'schedule request failed', meta: { code: '23503' } }]);
    expect(JSON.stringify({ body: res.body, lines })).not.toMatch(/agent_schedules|pat_fk|Pat/);
  });

  test('an odd error code is dropped rather than passed on', async () => {
    createSchedule.mockRejectedValue(Object.assign(new Error('boom'), { code: 'not a code: sam@example.com' }));
    const res = await request(app()).post('/api/schedules').send({});
    expect(res.body.code).toBeNull();
    expect(JSON.stringify(lines)).not.toMatch(/sam@example/);
  });

  test('a deliberate refusal keeps its own plain sentence', async () => {
    createSchedule.mockRejectedValue(Object.assign(new Error('Choose when the schedule should run.'), { statusCode: 400 }));
    const res = await request(app()).post('/api/schedules').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Choose when the schedule should run.');
    expect(lines).toEqual([]);
  });
});
