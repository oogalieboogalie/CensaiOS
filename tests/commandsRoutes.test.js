import { jest } from '@jest/globals';
import request from 'supertest';

const mockPool = { query: jest.fn(), connect: jest.fn() };
const createTodoItem = jest.fn();
const createWorkspaceEvent = jest.fn();
const getWorkspaceState = jest.fn();
const setWorkspaceState = jest.fn();
const requireWorkspaceMember = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/operational-intelligence/todos.js', () => ({
  createTodoItem,
}));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({
  createWorkspaceEvent,
}));
jest.unstable_mockModule('../server/state/clientStateStore.js', () => ({
  WORKSPACE_STATE_KEY: 'homebase.workspace.v1',
  getWorkspaceState,
  setWorkspaceState,
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  requireWorkspaceMember,
}));

const envSnapshot = { ...process.env };
const { default: express } = await import('express');
const { commandsRouter } = await import('../server/routes/commands.js');
const {
  __resetWorkspaceHubForTests,
  joinWorkspaceClient,
} = await import('../server/collaboration/workspaceHub.js');

function createApp(session = { userId: 7, userRole: 'user' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    next();
  });
  app.use('/api', commandsRouter);
  return app;
}

describe('commands routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetWorkspaceHubForTests();
    mockPool.query.mockResolvedValue({ rows: [{ id: 'run-1' }] });
    mockPool.connect.mockResolvedValue({ query: mockPool.query, release: jest.fn() });
    process.env = { ...envSnapshot };
    process.env.HOMEBASE_MODE = 'private_server';
  });

  afterAll(() => {
    process.env = envSnapshot;
  });

  test('lists command metadata', async () => {
    const response = await request(createApp()).get('/api/commands');

    expect(response.status).toBe(200);
    expect(response.body.commands.map(command => command.id)).toEqual(expect.arrayContaining([
      'workspace.state.read',
      'workspace.state.write',
      'window.import.validate',
      'artifact.search',
      'operational.todo.create',
    ]));
  });

  test('executes workspace state reads with request-derived context and audit emission', async () => {
    getWorkspaceState.mockResolvedValue({
      found: true,
      source: 'database',
      value: { wins: [{ id: 'w-1' }] },
      revision: 4,
    });
    createWorkspaceEvent.mockResolvedValue({ id: 'event-1' });

    const response = await request(createApp())
      .post('/api/commands/workspace.state.read/execute')
      .send({ workspaceId: 'workspace-1' });

    expect(response.status).toBe(200);
    expect(getWorkspaceState).toHaveBeenCalledWith({
      db: mockPool,
      workspaceId: 'workspace-1',
      key: 'homebase.workspace.v1',
    });
    expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: mockPool }, expect.objectContaining({
      workspaceId: 'workspace-1',
      type: 'command.executed',
      actor: { kind: 'user', id: '7' },
    }));
    expect(response.body.context).toEqual({
      tenantId: null,
      userId: '7',
      userRole: 'user',
      workspaceId: 'workspace-1',
      actor: { kind: 'user', id: '7' },
      principal: 'user',
      runtimeMode: 'private_server',
    });
    expect(response.body.runId).toBe('run-1');
    expect(response.body.result).toEqual({
      key: 'homebase.workspace.v1',
      workspaceId: 'workspace-1',
      storageScope: 'workspace',
      found: true,
      revision: 4,
      value: { wins: [{ id: 'w-1' }] },
    });
    expect(response.body.auditEventId).toBe('event-1');
  });

  test('executes operational todo creation with actor and workspace context', async () => {
    createTodoItem.mockResolvedValue({
      list: { id: 'list-1', title: 'Plan' },
      items: [{ id: 'task-1', text: 'Ship it' }],
    });
    createWorkspaceEvent.mockResolvedValue({ id: 'event-2' });

    const response = await request(createApp())
      .post('/api/commands/operational.todo.create/execute')
      .send({
        workspaceId: 'workspace-1',
        listArtifactId: 'list-1',
        item: { text: 'Ship it' },
        order: 3,
      });

    expect(response.status).toBe(200);
    expect(createTodoItem).toHaveBeenCalledWith(mockPool, {
      workspaceId: 'workspace-1',
      actor: { kind: 'user', id: '7' },
      listArtifactId: 'list-1',
      item: { text: 'Ship it' },
      order: 3,
    });
    expect(response.body.result.items).toHaveLength(1);
  });

  test('workspace command writes propagate the caller revision and returned revision', async () => {
    setWorkspaceState.mockResolvedValue({ revision: 6 });
    createWorkspaceEvent.mockResolvedValue({ id: 'event-write' });
    const send = jest.fn();
    joinWorkspaceClient({
      workspaceId: 'workspace-1', clientId: 'peer', actor: { id: '8' }, send,
    });
    const response = await request(createApp())
      .post('/api/commands/workspace.state.write/execute')
      .send({ workspaceId: 'workspace-1', value: { wins: [] }, expectedRevision: 5 });

    expect(response.status).toBe(200);
    expect(setWorkspaceState).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1', expectedRevision: 5, value: { wins: [] },
    }));
    expect(response.body.result.revision).toBe(6);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'workspace.committed', revision: 6, value: { wins: [] },
    }));

    send.mockClear();
    const nonCanvas = await request(createApp())
      .post('/api/commands/workspace.state.write/execute')
      .send({
        workspaceId: 'workspace-1', key: 'homebase.presets.v1',
        value: { presets: [] }, expectedRevision: 0,
      });
    expect(nonCanvas.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  test('returns blocked import patterns from validate command without writing files', async () => {
    const response = await request(createApp({ userId: 7, userRole: 'admin' }))
      .post('/api/commands/window.import.validate/execute')
      .send({
        workspaceId: 'workspace-1',
        label: 'Danger Window',
        rawJsx: "const output = eval('2 + 2'); import('https://example.com/tool.js');",
      });

    expect(response.status).toBe(200);
    expect(response.body.result.ok).toBe(false);
    expect(response.body.result.componentName).toBe('DangerWindowWindow');
    expect(response.body.result.issues.map(issue => issue.code)).toEqual([
      'eval',
      'import-http',
    ]);
  });

  test('denies missing command capabilities before the handler and records command.failed', async () => {
    createWorkspaceEvent.mockResolvedValue({ id: 'event-denied' });

    const response = await request(createApp())
      .post('/api/commands/window.import.validate/execute')
      .send({
        workspaceId: 'workspace-1',
        label: 'Safe Window',
        rawJsx: 'export function SafeWindow() { return <div>Safe</div>; }',
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(expect.objectContaining({
      ok: false,
      runId: 'run-1',
      code: 'CAPABILITY_DENIED',
      error: 'Missing required capability: window.import',
      auditEventId: 'event-denied',
    }));
    expect(createWorkspaceEvent).toHaveBeenCalledWith({ db: mockPool }, expect.objectContaining({
      workspaceId: 'workspace-1',
      type: 'command.failed',
      actor: { kind: 'user', id: '7' },
      payload: expect.objectContaining({
        commandId: 'window.import.validate',
        requiredCapabilities: ['window.import'],
      }),
    }));
  });

  test('fails command execution when workspace context is missing and records a failed audit when possible', async () => {
    createWorkspaceEvent.mockResolvedValue({ id: 'event-3' });

    const response = await request(createApp())
      .post('/api/commands/workspace.state.write/execute')
      .send({ value: { wins: [] } });

    expect(response.status).toBe(400);
    expect(setWorkspaceState).not.toHaveBeenCalled();
    expect(response.body.runId).toBe('run-1');
    expect(response.body.error).toBe('workspaceId is required');
    expect(response.body.auditEventId).toBeNull();
  });
});
