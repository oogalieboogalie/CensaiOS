import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const resolveWorkspaceContext = jest.fn();
const envSnapshot = { ...process.env };

jest.unstable_mockModule('../server/db.js', () => ({
  default: { query },
}));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({
  resolveWorkspaceContext,
}));

const { default: express } = await import('express');
const {
  operationalIntelligenceRouter,
} = await import('../server/routes/operationalIntelligence.js');

function app(session = { userId: 7 }) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = session;
    next();
  });
  instance.use('/api/operational-intelligence', operationalIntelligenceRouter);
  return instance;
}

describe('operational intelligence event isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-owned', role: 'member' });
  });

  afterAll(() => {
    process.env = envSnapshot;
  });

  test('lists only events from the authorized workspace', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'event-owned' }] });

    const response = await request(app())
      .get('/api/operational-intelligence/events')
      .query({ workspaceId: 'workspace-owned', type: 'task.updated', limit: 12 });

    expect(response.status).toBe(200);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      userId: 7,
      workspaceId: 'workspace-owned',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/workspace_id = \$1[\s\S]*event_type NOT LIKE 'ai\.free_tier\.%'[\s\S]*event_type NOT IN \('tool\.invocation', 'session\.failure'\)[\s\S]*event_type = \$2/),
      ['workspace-owned', 'task.updated', 12]
    );
    expect(response.body).toEqual([{ id: 'event-owned' }]);
  });

  test('keeps the private allowance ledger out of the generic event feed', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app())
      .get('/api/operational-intelligence/events')
      .query({ workspaceId: 'workspace-owned', type: 'ai.free_tier.reserved' });

    expect(response.status).toBe(200);
    expect(query.mock.calls[0][0]).toContain("event_type NOT LIKE 'ai.free_tier.%'");
  });

  test.each(['tool.invocation', 'session.failure'])(
    'keeps private trace event %s out of the generic event feed',
    async (type) => {
      query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app())
        .get('/api/operational-intelligence/events')
        .query({ workspaceId: 'workspace-owned', type });

      expect(response.status).toBe(200);
      expect(query.mock.calls[0][0]).toContain("event_type NOT IN ('tool.invocation', 'session.failure')");
      expect(response.body).toEqual([]);
    }
  );

  test('bounds event reads and defaults through authoritative workspace resolution', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app())
      .get('/api/operational-intelligence/events')
      .query({ limit: 99999 });

    expect(response.status).toBe(200);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      userId: 7,
      workspaceId: null,
    });
    expect(query.mock.calls[0][1]).toEqual(['workspace-owned', 200]);
  });

  test('denies event reads when workspace membership fails', async () => {
    const denied = Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    resolveWorkspaceContext.mockRejectedValueOnce(denied);

    const response = await request(app())
      .get('/api/operational-intelligence/events')
      .query({ workspaceId: 'workspace-foreign' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Workspace access denied');
    expect(query).not.toHaveBeenCalled();
  });

  test('does not return internal database errors', async () => {
    query.mockRejectedValueOnce(new Error('postgres password=never-return'));

    const response = await request(app())
      .get('/api/operational-intelligence/events')
      .query({ workspaceId: 'workspace-owned' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid operational intelligence request' });
    expect(JSON.stringify(response.body)).not.toContain('never-return');
  });

  test('telemetry uses authorized workspace, session actor, and a fixed event type', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'artifact-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

    const response = await request(app())
      .post('/api/operational-intelligence/telemetry/provenance')
      .send({
        workspace_id: 'workspace-owned',
        event_type: 'ai.free_tier.reserved',
        actor_kind: 'system',
        actor_id: 'attacker',
        artifact_id: 'foreign-artifact',
        correlation_id: 'foreign-correlation',
        file_path: 'src/app.js',
        status: 'success',
      });

    expect(response.status).toBe(201);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      userId: 7,
      workspaceId: 'workspace-owned',
    });
    expect(query.mock.calls[0][1]).toEqual(['workspace-owned', 'src/app.js']);
    const insertParams = query.mock.calls[1][1];
    expect(insertParams.slice(0, 5)).toEqual([
      'workspace-owned', 'runtime_validation', 'user', '7', 'artifact-1',
    ]);
    expect(JSON.parse(insertParams[5])).toEqual({ file_path: 'src/app.js', status: 'success' });
    expect(response.body).toEqual({ id: 'event-1', linkedArtifact: 'artifact-1' });
  });

  test('denies telemetry for a foreign workspace before writing', async () => {
    const denied = Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    resolveWorkspaceContext.mockRejectedValueOnce(denied);

    const response = await request(app())
      .post('/api/operational-intelligence/telemetry/provenance')
      .send({ workspace_id: 'workspace-foreign', event_type: 'runtime_validation' });

    expect({ status: response.status, body: response.body }).toEqual({
      status: 403,
      body: { error: 'Workspace access denied' },
    });
    expect(query).not.toHaveBeenCalled();
  });

  test('allows viewer event reads but denies telemetry writes', async () => {
    resolveWorkspaceContext.mockResolvedValueOnce({ id: 'workspace-owned', role: 'viewer' });
    const response = await request(app())
      .post('/api/operational-intelligence/telemetry/provenance')
      .send({ workspace_id: 'workspace-owned', file_path: 'src/app.js' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Workspace access denied' });
    expect(query).not.toHaveBeenCalled();
  });

  test.each([
    ['get', '/api/operational-intelligence/events'],
    ['post', '/api/operational-intelligence/telemetry/provenance'],
  ])('requires authentication for %s %s', async (method, path) => {
    const response = await request(app({}))[method](path).send({ workspace_id: 'workspace-owned' });

    expect({ status: response.status, body: response.body }).toEqual({
      status: 401,
      body: { error: 'Authenticated user required' },
    });
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
