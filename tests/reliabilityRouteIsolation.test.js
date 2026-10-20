import { jest } from '@jest/globals';
import request from 'supertest';

// Two boards, each with one member. Alma (user 7) owns board-a, Sam (user 8) owns board-b.
const MEMBERS = { 7: 'board-a', 8: 'board-b' };
let scans;
let feedback;

const resolveWorkspaceContext = jest.fn(async (_db, { userId, workspaceId }) => {
  const own = MEMBERS[userId];
  if (workspaceId && workspaceId !== own) {
    throw Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
  }
  return { id: own, role: 'owner' };
});

// A stand-in for Postgres. It only narrows to one board when the SQL the route
// sends actually filters on workspace_id, so dropping that filter fails these tests.
const query = jest.fn(async (sql, params = []) => {
  if (/^SELECT \* FROM ai_reliability_scans/.test(sql)) {
    const scoped = /WHERE workspace_id = \$1/.test(sql);
    return { rows: scoped ? scans.filter(row => row.workspace_id === params[0]) : scans };
  }
  if (/INSERT INTO ai_reliability_scans/.test(sql)) {
    const [workspaceId, filePath, score] = params;
    const row = { id: scans.length + 1, workspace_id: workspaceId, file_path: filePath, score };
    scans.push(row);
    return { rows: [row] };
  }
  if (/INSERT INTO ai_reliability_feedback/.test(sql)) {
    const scanId = Number(params[0]);
    const scoped = /workspace_id = \$2/.test(sql);
    const scan = scans.find(row => row.id === scanId && (!scoped || row.workspace_id === params[1]));
    if (!scan) return { rows: [] };
    const row = { id: feedback.length + 1, scan_id: scan.id };
    feedback.push(row);
    return { rows: [row] };
  }
  throw new Error(`Unexpected query: ${sql}`);
});

jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));

const { default: express } = await import('express');
const { reliabilityRouter } = await import('../server/routes/reliability.js');

function app(session) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = session;
    next();
  });
  instance.use('/api/reliability', reliabilityRouter);
  return instance;
}

describe('Reliability scans stay on their own board', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    scans = [
      { id: 1, workspace_id: 'board-a', file_path: 'src/secret-plan.js', score: 70 },
      { id: 2, workspace_id: 'board-b', file_path: 'src/sam.js', score: 90 },
    ];
    feedback = [];
  });

  test('a member sees only their own board\'s scans', async () => {
    const response = await request(app({ userId: 7 })).get('/api/reliability/scans?workspaceId=board-a');
    expect(response.status).toBe(200);
    expect(response.body.map(row => row.id)).toEqual([1]);
  });

  test('a user on another board cannot read the first board\'s scans', async () => {
    const asked = await request(app({ userId: 8 })).get('/api/reliability/scans?workspaceId=board-a');
    expect(asked.status).toBe(403);

    const own = await request(app({ userId: 8 })).get('/api/reliability/scans?workspaceId=board-b');
    expect(own.status).toBe(200);
    expect(own.body.map(row => row.id)).toEqual([2]);
    expect(JSON.stringify(own.body)).not.toContain('secret-plan');
  });

  test('signed-out callers get nothing', async () => {
    const response = await request(app({})).get('/api/reliability/scans');
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  test('feedback on another board\'s scan is refused, even from the caller\'s own board', async () => {
    const response = await request(app({ userId: 8 }))
      .post('/api/reliability/feedback')
      .send({ workspaceId: 'board-b', scanId: 1, helpful: false, comment: 'poke' });
    expect(response.status).toBe(404);
    expect(feedback).toHaveLength(0);

    const ownBoard = await request(app({ userId: 7 }))
      .post('/api/reliability/feedback')
      .send({ workspaceId: 'board-a', scanId: 1, helpful: true });
    expect(ownBoard.status).toBe(201);
    expect(feedback).toHaveLength(1);
  });

  test('a new scan is saved to the caller\'s board', async () => {
    const response = await request(app({ userId: 8 }))
      .post('/api/reliability/scans')
      .send({ workspaceId: 'board-b', filePath: 'server/lib/reliability/engine.js' });
    expect(response.status).toBe(201);
    expect(response.body.workspace_id).toBe('board-b');
  });

  test('a new scan cannot be saved to someone else\'s board', async () => {
    const response = await request(app({ userId: 8 }))
      .post('/api/reliability/scans')
      .send({ workspaceId: 'board-a', filePath: 'server/lib/reliability/engine.js' });
    expect(response.status).toBe(403);
    expect(scans.filter(row => row.workspace_id === 'board-a')).toHaveLength(1);
  });

  test('writes must name the board instead of guessing one', async () => {
    const scan = await request(app({ userId: 8 }))
      .post('/api/reliability/scans')
      .send({ filePath: 'server/lib/reliability/engine.js' });
    expect(scan.status).toBe(400);

    const note = await request(app({ userId: 8 }))
      .post('/api/reliability/feedback')
      .send({ scanId: 2, helpful: true });
    expect(note.status).toBe(400);
    expect(feedback).toHaveLength(0);
  });
});
