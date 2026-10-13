import { jest } from '@jest/globals';
import request from 'supertest';
const query = jest.fn();
const resolveWorkspaceContext = jest.fn();
const createArtifact = jest.fn();
const createRelationship = jest.fn();
const createWorkspaceEvent = jest.fn();
const resolveArtifact = jest.fn();
const envSnapshot = { ...process.env };
jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({
  createArtifact,
  createRelationship,
  createWorkspaceEvent,
  resolveArtifact,
}));
const { default: express } = await import('express');
const { operationalIntelligenceRouter } = await import('../server/routes/operationalIntelligence.js');
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
const trace = {
  id: 'trace-owned',
  workspace_id: 'workspace-owned',
  artifact_type: 'agent_session_trace',
  title: 'Owned trace',
  data: {
    initialContext: { messagesCount: 1, prompt: 'prompt-never-return' },
    finalTextPreview: 'done',
  },
};
const safeTrace = {
  ...trace,
  data: { initialContext: { messagesCount: 1 }, finalTextLength: 4 },
  metadata: {},
};
describe('operational intelligence trace isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE = 'true';
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-owned', role: 'member' });
  });

  afterAll(() => {
    process.env = envSnapshot;
  });

  test('lists traces only from the membership-authorized workspace', async () => {
    query.mockResolvedValueOnce({ rows: [trace] });
    const response = await request(app())
      .get('/api/operational-intelligence/traces')
      .query({ workspaceId: 'workspace-owned', limit: 9999 });

    expect(response.status).toBe(200);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      userId: 7,
      workspaceId: 'workspace-owned',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/workspace_id = \$1[\s\S]*artifact_type = 'agent_session_trace'/),
      ['workspace-owned', 200]
    );
    expect(response.body).toEqual([safeTrace]);
    expect(JSON.stringify(response.body)).not.toContain('prompt-never-return');
  });
  test('loads a trace and its events with workspace constraints on both queries', async () => {
    const event = {
      id: 'event-owned',
      workspace_id: 'workspace-owned',
      event_type: 'tool.invocation',
      payload: {
        toolName: 'journal',
        args: { content: 'journal-never-return', __provenance: { prompt: 'prompt-never-return' } },
        resultPreview: 'journal-never-return',
        ok: true,
      },
    };
    query
      .mockResolvedValueOnce({ rows: [trace] })
      .mockResolvedValueOnce({ rows: [event] });
    const response = await request(app())
      .get('/api/operational-intelligence/traces/trace-owned/events');

    expect(response.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual(['trace-owned', 'workspace-owned']);
    expect(query.mock.calls[0][0]).toMatch(/artifact_type = 'agent_session_trace'/);
    expect(query.mock.calls[1][1]).toEqual(['trace-owned', 'workspace-owned']);
    expect(query.mock.calls[1][0]).toMatch(/artifact_id = \$1 AND workspace_id = \$2/);
    expect(response.body).toEqual([{
      id: 'event-owned',
      workspace_id: 'workspace-owned',
      event_type: 'tool.invocation',
      payload: {
        toolName: 'journal',
        ok: true,
        private: true,
        arguments: '[redacted]',
        result: '[redacted]',
      },
    }]);
    expect(JSON.stringify(response.body)).not.toMatch(/journal-never-return|prompt-never-return|__provenance/);
  });
  test('hides foreign or missing traces before reading events', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const response = await request(app())
      .get('/api/operational-intelligence/traces/trace-foreign/events');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Trace not found');
    expect(query).toHaveBeenCalledTimes(1);
  });
  test('conversion ignores body identity and writes only to the authorized workspace', async () => {
    const events = [{ event_type: 'agent.round', payload: { round: 1 } }];
    const converted = { id: 'test-owned', workspace_id: 'workspace-owned' };
    query
      .mockResolvedValueOnce({ rows: [trace] })
      .mockResolvedValueOnce({ rows: events });
    createArtifact.mockResolvedValueOnce(converted);
    const response = await request(app())
      .post('/api/operational-intelligence/traces/trace-owned/convert-to-test')
      .send({
        workspaceId: 'workspace-foreign',
        workspace_id: 'workspace-foreign',
        owner: { kind: 'system', id: 'attacker' },
      });

    expect(response.status).toBe(200);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      userId: 7,
      workspaceId: null,
    });
    expect(createArtifact).toHaveBeenCalledWith({ db: expect.anything() }, {
      workspaceId: 'workspace-owned',
      type: 'regression_test_case',
      title: 'Regression Test: Owned trace',
      owner: { kind: 'system', id: 'observability' },
      data: {
        traceId: 'trace-owned',
        initialContext: { messagesCount: 1 },
        events: [{ type: 'agent.round', payload: { round: 1 } }],
        finalTextLength: 4,
      },
      metadata: { convertedFrom: 'trace-owned' },
    });
    expect(response.body).toEqual(converted);
  });
  test('denies a foreign workspace before trace reads or conversion', async () => {
    const denied = Object.assign(new Error('Workspace access denied'), { statusCode: 403 });
    resolveWorkspaceContext.mockRejectedValueOnce(denied);
    const response = await request(app())
      .post('/api/operational-intelligence/traces/trace-foreign/convert-to-test')
      .query({ workspaceId: 'workspace-foreign' });

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
  });
  test('allows viewer trace reads but denies conversion writes', async () => {
    resolveWorkspaceContext.mockResolvedValueOnce({ id: 'workspace-owned', role: 'viewer' });
    const response = await request(app())
      .post('/api/operational-intelligence/traces/trace-owned/convert-to-test');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Workspace access denied' });
    expect(query).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
  });
  test('does not return internal trace errors', async () => {
    query.mockRejectedValueOnce(new Error('database token=never-return'));

    const response = await request(app())
      .get('/api/operational-intelligence/traces')
      .query({ workspaceId: 'workspace-owned' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid operational intelligence request' });
    expect(JSON.stringify(response.body)).not.toContain('never-return');
  });

  test.each([
    ['get', '/api/operational-intelligence/traces'],
    ['get', '/api/operational-intelligence/traces/trace-owned/events'],
    ['post', '/api/operational-intelligence/traces/trace-owned/convert-to-test'],
  ])('requires authentication for %s %s', async (method, path) => {
    const response = await request(app({}))[method](path);

    expect(response.status).toBe(401);
    expect(resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(createArtifact).not.toHaveBeenCalled();
  });
});
