import { jest } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const resolveWorkspaceContext = jest.fn();
const registerModelDeployment = jest.fn();
const ingestTelemetry = jest.fn();
const triggerRetraining = jest.fn();
const resolveArtifact = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/workspaces/context.js', () => ({ resolveWorkspaceContext }));
jest.unstable_mockModule('../server/operational-intelligence/mlops.js', () => ({
  registerModelDeployment,
  ingestTelemetry,
  triggerRetraining,
}));
jest.unstable_mockModule('../server/operational-intelligence/factories.js', () => ({ resolveArtifact }));

const { default: express } = await import('express');
const { mlopsRouter } = await import('../server/routes/mlops.js');

function app(session = { userId: 7 }) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.session = session;
    next();
  });
  instance.use('/api/mlops', mlopsRouter);
  return instance;
}

describe('MLOps route isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-owned', role: 'member' });
  });

  test('lists only models from the authorized workspace', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'model-owned' }] });

    const response = await request(app())
      .get('/api/mlops/models?workspaceId=workspace-owned');

    expect(response.status).toBe(200);
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(expect.anything(), {
      userId: 7,
      workspaceId: 'workspace-owned',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/workspace_id = \$1[\s\S]*ml_model_deployment/),
      ['workspace-owned'],
    );
  });

  test('derives workspace and actor instead of accepting body spoof fields', async () => {
    registerModelDeployment.mockResolvedValueOnce({ id: 'model-owned' });

    const response = await request(app())
      .post('/api/mlops/models')
      .send({
        workspaceId: 'workspace-owned',
        workspace_id: 'workspace-owned',
        owner: { kind: 'system', id: 'attacker' },
        title: 'Model',
      });

    expect(response.status).toBe(201);
    expect(registerModelDeployment).toHaveBeenCalledWith({ db: expect.anything() }, {
      workspaceId: 'workspace-owned',
      owner: { kind: 'user', id: '7' },
      title: 'Model',
      modelName: undefined,
      version: undefined,
      baseline: undefined,
      thresholds: undefined,
    });
  });

  test('denies foreign membership before model or artifact access', async () => {
    resolveWorkspaceContext.mockRejectedValueOnce(Object.assign(
      new Error('Workspace access denied'),
      { statusCode: 403 },
    ));

    const response = await request(app())
      .post('/api/mlops/telemetry')
      .send({ workspaceId: 'workspace-foreign', deploymentId: 'model-foreign', features: {} });

    expect(response.status).toBe(403);
    expect(ingestTelemetry).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('allows viewer reads but denies all viewer mutations', async () => {
    resolveWorkspaceContext.mockResolvedValue({ id: 'workspace-owned', role: 'viewer' });
    query.mockResolvedValueOnce({ rows: [] });

    const read = await request(app())
      .get('/api/mlops/models?workspaceId=workspace-owned');
    const write = await request(app())
      .post('/api/mlops/models/model-owned/retrain')
      .send({ workspaceId: 'workspace-owned', reason: 'spoof' });

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(triggerRetraining).not.toHaveBeenCalled();
  });

  test('scopes model and alert artifact lookups by workspace', async () => {
    resolveArtifact.mockResolvedValue({
      id: 'model-owned', workspace_id: 'workspace-owned', artifact_type: 'ml_model_deployment',
    });
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app())
      .get('/api/mlops/models/model-owned/alerts?workspaceId=workspace-owned');

    expect(response.status).toBe(200);
    expect(resolveArtifact).toHaveBeenCalledWith({ db: expect.anything() }, {
      artifactId: 'model-owned', workspaceId: 'workspace-owned',
    });
    expect(query.mock.calls[0][1]).toEqual(['workspace-owned', 'model-owned']);
  });

  test('requires authentication and never returns internal failures', async () => {
    const unauthenticated = await request(app({}))
      .get('/api/mlops/models?workspaceId=workspace-owned');
    query.mockRejectedValueOnce(new Error('password=never-return'));
    const failed = await request(app())
      .get('/api/mlops/models?workspaceId=workspace-owned');

    expect(unauthenticated.status).toBe(401);
    expect(failed.status).toBe(400);
    expect(failed.body).toEqual({ error: 'Invalid operational intelligence request' });
    expect(JSON.stringify(failed.body)).not.toContain('never-return');
  });
});
