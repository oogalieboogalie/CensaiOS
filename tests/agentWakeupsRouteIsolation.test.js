import { jest } from '@jest/globals';
import request from 'supertest';

// Alex (user 7) owns board-a. Sam (user 8) owns board-b. Vic (user 9) is view-only on board-a.
// The agent "atlas" has work on both boards.
const MEMBERS = { 7: { 'board-a': 'owner' }, 8: { 'board-b': 'owner' }, 9: { 'board-a': 'viewer' } };
const HOME = { 7: 'board-a', 8: 'board-b', 9: 'board-a' };
const messages = [
  { id: 1, to_agent: 'atlas', workspace_id: 'board-a', read_at: null },
  { id: 2, to_agent: 'atlas', workspace_id: 'board-b', read_at: null },
];
let wakeups;

const resolveWorkspaceContext = jest.fn(async (_db, { userId, workspaceId }) => {
  const id = workspaceId || HOME[userId];
  const role = MEMBERS[userId]?.[id];
  if (!role) throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  return { id, role };
});

// A stand-in for Postgres. It only narrows to one board when the SQL the route
// sends actually filters on workspace_id, so dropping that filter fails these tests.
const onBoard = (messageId, workspaceId) =>
  messages.some(m => m.id === messageId && m.workspace_id === workspaceId);

const query = jest.fn(async (sql, [id, workspaceId]) => {
  if (/FROM agent_wakeups aw/.test(sql)) {
    const scoped = /am\.workspace_id\s*=\s*\$2/.test(sql);
    return { rows: wakeups.filter(w => w.agent_id === id && (!scoped || onBoard(w.message_id, workspaceId))) };
  }
  if (/COUNT\(\*\)::int AS count FROM agent_messages/.test(sql)) {
    const scoped = /workspace_id\s*=\s*\$2/.test(sql);
    const rows = messages.filter(m => m.to_agent === id && (!scoped || m.workspace_id === workspaceId));
    return { rows: [{ count: rows.length }] };
  }
  if (/UPDATE agent_wakeups/.test(sql)) {
    const scoped = /agent_messages WHERE workspace_id\s*=\s*\$2/.test(sql);
    const row = wakeups.find(w => w.id === Number(id) && w.status === 'failed'
      && (!scoped || onBoard(w.message_id, workspaceId)));
    if (row) row.status = 'queued';
    return { rows: row ? [row] : [] };
  }
  throw new Error(`Unexpected query: ${sql}`);
});

jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const { default: express } = await import('express');
const { wakeupsRouter } = await import('../server/routes/agents/wakeups.js');

function app(userId) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = { userId };
    next();
  });
  instance.use('/api', wakeupsRouter);
  return instance;
}

describe('Agent wakeups stay on their own board', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wakeups = [
      { id: 10, agent_id: 'atlas', message_id: 1, status: 'failed', subject: 'board-a plan' },
      { id: 20, agent_id: 'atlas', message_id: 2, status: 'failed', subject: 'board-b plan' },
    ];
  });

  test('each member sees only their own board\'s agent activity', async () => {
    const alex = await request(app(7)).get('/api/agent-wakeups/atlas?workspaceId=board-a');
    expect(alex.status).toBe(200);
    expect(alex.body.wakeups.map(w => w.id)).toEqual([10]);
    expect(alex.body.unread).toBe(1);

    const sam = await request(app(8)).get('/api/agent-wakeups/atlas?workspaceId=board-b');
    expect(sam.status).toBe(200);
    expect(sam.body.wakeups.map(w => w.id)).toEqual([20]);
    expect(sam.body.unread).toBe(1);
  });

  test('asking for a board you are not on is refused', async () => {
    const asked = await request(app(8)).get('/api/agent-wakeups/atlas?workspaceId=board-a');
    expect(asked.status).toBe(403);
  });

  test('a user on another board cannot retry the wakeup from their own board', async () => {
    const response = await request(app(8))
      .post('/api/agent-wakeups/10/retry')
      .send({ workspaceId: 'board-b' });
    expect(response.status).toBe(409);
    expect(wakeups[0].status).toBe('failed');
  });

  test('a view-only member cannot retry, but an owner can', async () => {
    const viewer = await request(app(9))
      .post('/api/agent-wakeups/10/retry')
      .send({ workspaceId: 'board-a' });
    expect(viewer.status).toBe(403);
    expect(wakeups[0].status).toBe('failed');

    const owner = await request(app(7))
      .post('/api/agent-wakeups/10/retry')
      .send({ workspaceId: 'board-a' });
    expect(owner.status).toBe(200);
    expect(wakeups[0].status).toBe('queued');
  });
});
