import { jest } from '@jest/globals';
import request from 'supertest';

const mockPool = { query: jest.fn(), connect: jest.fn() };
const createHandoff = jest.fn();
const createTodoItem = jest.fn();
const dispatchTodoItem = jest.fn();
const loadItems = jest.fn();
const loadArtifactCausality = jest.fn();
const openTodoList = jest.fn();
const createArtifact = jest.fn();
const resolveArtifact = jest.fn();
const updateTodoItem = jest.fn();
const resolveWorkspaceContext = jest.fn();
const safeFastForwardCurrentProject = jest.fn();
const syncPulledTodoArtifacts = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: mockPool }));
jest.unstable_mockModule('../server/operational-intelligence/handoffs.js', () => ({
  createHandoff,
  loadArtifactCausality,
}));
jest.unstable_mockModule('../server/operational-intelligence/localPull.js', () => ({
  safeFastForwardCurrentProject,
  syncPulledTodoArtifacts,
}));
jest.unstable_mockModule('../server/operational-intelligence/todoDispatch.js', () => ({
  dispatchTodoItem,
}));
jest.unstable_mockModule('../server/operational-intelligence/todos.js', () => ({
  createTodoItem,
  loadItems,
  openTodoList,
  updateTodoItem,
}));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({
  resolveArtifact,
  createArtifact,
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext,
}));

const envSnapshot = { ...process.env };
const { default: express } = await import('express');
const { operationalIntelligenceRouter } = await import('../server/routes/operationalIntelligence.js');

function createApp(session = { userId: 7 }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = session;
    next();
  });
  app.use('/api/operational-intelligence', operationalIntelligenceRouter);
  return app;
}

describe('operational intelligence routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...envSnapshot };
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'member' });
  });

  afterAll(() => {
    process.env = envSnapshot;
  });

  test('blocks handoff creation when the feature flag is disabled', async () => {
    const response = await request(createApp())
      .post('/api/operational-intelligence/handoffs')
      .send({ workspaceId: 'workspace-1' });

    expect(response.status).toBe(404);
    expect(createHandoff).not.toHaveBeenCalled();
  });

  test('creates handoffs and returns the created event payload when enabled', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    createHandoff.mockResolvedValue({
      handoff: { id: 'handoff-1', workspace_id: 'workspace-1', title: 'Ship it' },
      event: { id: 'event-1', event_type: 'handoff.created' },
    });
    loadArtifactCausality.mockResolvedValue({
      artifact: { id: 'handoff-1', artifact_type: 'handoff' },
      upstream: [{ relationship: { id: 'rel-up' }, artifact: { id: 'todo-1' } }],
      downstream: [{ relationship: { id: 'rel-down' }, artifact: { id: 'agent-1' } }],
      events: [{ id: 'ignored' }],
    });

    const response = await request(createApp())
      .post('/api/operational-intelligence/handoffs')
      .send({ workspaceId: 'workspace-1', title: 'Ship it' });

    expect(response.status).toBe(200);
    expect(createHandoff).toHaveBeenCalledWith({ db: mockPool }, {
      workspaceId: 'workspace-1',
      title: 'Ship it',
      owner: { kind: 'user', id: '7' },
    });
    expect(loadArtifactCausality).toHaveBeenCalledWith({ db: mockPool }, {
      workspaceId: 'workspace-1',
      artifactId: 'handoff-1',
      limit: undefined,
    });
    expect(response.body).toEqual({
      handoff: { id: 'handoff-1', artifact_type: 'handoff' },
      upstream: [{ relationship: { id: 'rel-up' }, artifact: { id: 'todo-1' } }],
      downstream: [{ relationship: { id: 'rel-down' }, artifact: { id: 'agent-1' } }],
      events: [{ id: 'event-1', event_type: 'handoff.created' }],
    });
  });

  test('loads artifact causality with forwarded query parameters', async () => {
    process.env.CENSAI_FEATURES = 'operational-intelligence';
    loadArtifactCausality.mockResolvedValue({
      artifact: { id: 'handoff-1' },
      upstream: [],
      downstream: [],
      events: [],
    });

    const response = await request(createApp())
      .get('/api/operational-intelligence/artifacts/handoff-1/causality')
      .query({ workspaceId: 'workspace-1', limit: 7 });

    expect(response.status).toBe(200);
    expect(loadArtifactCausality).toHaveBeenCalledWith({ db: mockPool }, {
      workspaceId: 'workspace-1',
      artifactId: 'handoff-1',
      limit: '7',
    });
    expect(response.body.artifact.id).toBe('handoff-1');
  });

  test('passes actor and workspace context to todo open calls', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    openTodoList.mockResolvedValue({
      list: { id: 'list-1', title: 'Plan' },
      items: [],
    });

    const response = await request(createApp())
      .post('/api/operational-intelligence/todos/open')
      .send({ workspaceId: 'workspace-1', windowId: 'todos-1' });

    expect(response.status).toBe(200);
    expect(openTodoList).toHaveBeenCalledWith(mockPool, {
      workspaceId: 'workspace-1',
      windowId: 'todos-1',
      actor: { kind: 'user', id: '7' },
    });
  });

  test('rejects todo opens without workspace context', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';

    const response = await request(createApp())
      .post('/api/operational-intelligence/todos/open')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid operational intelligence request');
    expect(openTodoList).not.toHaveBeenCalled();
  });

  test('rejects cross-workspace todo reads', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    resolveArtifact.mockResolvedValue({
      id: 'list-1',
      workspace_id: 'workspace-2',
      artifact_type: 'task_list',
      title: 'Plan',
    });

    const response = await request(createApp())
      .get('/api/operational-intelligence/todos/list-1')
      .query({ workspaceId: 'workspace-1' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid operational intelligence request');
    expect(loadItems).not.toHaveBeenCalled();
  });

  test('denies a foreign workspace before handoff artifact access', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    resolveWorkspaceContext.mockRejectedValueOnce(Object.assign(
      new Error('Workspace access denied'),
      { statusCode: 403 },
    ));

    const response = await request(createApp())
      .post('/api/operational-intelligence/handoffs')
      .send({ workspaceId: 'workspace-foreign', owner: { kind: 'system', id: 'attacker' } });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Workspace access denied' });
    expect(createHandoff).not.toHaveBeenCalled();
  });

  test('allows viewer reads but denies viewer writes', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-1', role: 'viewer' });
    resolveArtifact.mockResolvedValue({
      id: 'list-1', workspace_id: 'workspace-1', artifact_type: 'task_list', title: 'Plan',
    });
    loadItems.mockResolvedValue([]);

    const read = await request(createApp())
      .get('/api/operational-intelligence/todos/list-1')
      .query({ workspaceId: 'workspace-1' });
    const write = await request(createApp())
      .post('/api/operational-intelligence/todos/open')
      .send({ workspaceId: 'workspace-1' });

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(openTodoList).not.toHaveBeenCalled();
  });

  test('rejects conflicting workspace selectors before authorization', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    const response = await request(createApp())
      .post('/api/operational-intelligence/todos/open?workspaceId=workspace-1')
      .send({ workspaceId: 'workspace-2' });

    expect(response.status).toBe(400);
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(openTodoList).not.toHaveBeenCalled();
  });

  test('requires authentication before workspace resolution', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    const response = await request(createApp({}))
      .get('/api/operational-intelligence/artifacts/handoff-1/causality')
      .query({ workspaceId: 'workspace-1' });

    expect(response.status).toBe(401);
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(loadArtifactCausality).not.toHaveBeenCalled();
  });

  test('blocks local pull in cloud mode before workspace or Git work', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    process.env.CENSAI_MODE = 'cloud_saas';
    process.env.HOMEBASE_MODE = '';

    const response = await request(createApp())
      .post('/api/operational-intelligence/sync/pull-merged')
      .send({ workspaceId: 'workspace-1', remote: '--upload-pack=attacker' });

    expect(response.status).toBe(403);
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(safeFastForwardCurrentProject).not.toHaveBeenCalled();
    expect(syncPulledTodoArtifacts).not.toHaveBeenCalled();
  });

  test('blocks private-server pull unless local files are explicitly enabled', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    process.env.CENSAI_MODE = 'private_server';
    process.env.HOMEBASE_ALLOW_LOCAL_FILES = 'false';

    const response = await request(createApp())
      .post('/api/operational-intelligence/sync/pull-merged')
      .send({ workspaceId: 'workspace-1' });

    expect(response.status).toBe(403);
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(safeFastForwardCurrentProject).not.toHaveBeenCalled();
  });

  test('scopes local pull synchronization and ignores caller Git overrides', async () => {
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    process.env.CENSAI_MODE = 'local_desktop';
    resolveWorkspaceContext.mockResolvedValueOnce({ id: 'workspace-1', role: 'owner' });
    safeFastForwardCurrentProject.mockResolvedValueOnce({ ok: true, status: 'up_to_date' });
    syncPulledTodoArtifacts.mockResolvedValueOnce([]);

    const response = await request(createApp())
      .post('/api/operational-intelligence/sync/pull-merged')
      .send({ workspaceId: 'workspace-1', remote: '--upload-pack=attacker', branch: 'foreign' });

    expect(response.status).toBe(200);
    expect(safeFastForwardCurrentProject).toHaveBeenCalledWith();
    expect(syncPulledTodoArtifacts).toHaveBeenCalledWith(
      mockPool,
      { ok: true, status: 'up_to_date' },
      { workspaceId: 'workspace-1' },
    );
  });
});
