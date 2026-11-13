import { jest } from '@jest/globals';
import request from 'supertest';

// Sam Example (user 7) is not on board "made-up-board-b". The search and
// to-do commands must refuse before reading or writing anything there.
const mockPool = { query: jest.fn(), connect: jest.fn() };
const createTodoItem = jest.fn();
const requireWorkspaceMember = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/operational-intelligence/todos.js', () => ({ createTodoItem }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({
  createWorkspaceEvent: jest.fn(async () => ({ id: 'event-1' })),
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ requireWorkspaceMember }));

const { default: express } = await import('express');
const { commandsRouter } = await import('../server/routes/commands.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: 7, userRole: 'user' }; next(); });
  app.use('/api', commandsRouter);
  return app;
}

const notOnBoard = () => Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
const artifactReads = () => mockPool.query.mock.calls.filter(([sql]) => /FROM artifacts/.test(String(sql)));

describe('commands on a board you are not on', () => {
  const envSnapshot = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [{ id: 'run-1', title: 'Made-up secret plan' }] });
    mockPool.connect.mockResolvedValue({ query: mockPool.query, release: jest.fn() });
    process.env.HOMEBASE_MODE = 'private_server';
    requireWorkspaceMember.mockImplementation(async (_db, { workspaceId }) => {
      if (workspaceId !== 'made-up-board-a') throw notOnBoard();
      return { id: workspaceId, role: 'member' };
    });
  });
  afterAll(() => { process.env = envSnapshot; });

  test('artifact.search refuses and reads nothing from that board', async () => {
    const res = await request(createApp())
      .post('/api/commands/artifact.search/execute').send({ workspaceId: 'made-up-board-b', query: '' });
    expect(res.status).toBe(403);
    expect(res.body.result).toBeUndefined();
    expect(artifactReads()).toEqual([]);
  });

  test('operational.todo.create refuses and writes nothing to that board', async () => {
    const res = await request(createApp())
      .post('/api/commands/operational.todo.create/execute')
      .send({ workspaceId: 'made-up-board-b', listArtifactId: 'list-1', item: { text: 'x' } });
    expect(res.status).toBe(403);
    expect(createTodoItem).not.toHaveBeenCalled();
  });

  test('a viewer on the board cannot add a to-do', async () => {
    requireWorkspaceMember.mockImplementation(async (_db, { roles }) => {
      if (roles && !roles.includes('viewer')) throw notOnBoard();
      return { id: 'made-up-board-a', role: 'viewer' };
    });
    const res = await request(createApp())
      .post('/api/commands/operational.todo.create/execute')
      .send({ workspaceId: 'made-up-board-a', listArtifactId: 'list-1', item: { text: 'x' } });
    expect(res.status).toBe(403);
    expect(createTodoItem).not.toHaveBeenCalled();
  });

  test('a member still searches their own board', async () => {
    const res = await request(createApp())
      .post('/api/commands/artifact.search/execute').send({ workspaceId: 'made-up-board-a', query: '' });
    expect(res.status).toBe(200);
    expect(requireWorkspaceMember).toHaveBeenCalledWith(mockPool, expect.objectContaining({ userId: '7', workspaceId: 'made-up-board-a' }));
  });
});
