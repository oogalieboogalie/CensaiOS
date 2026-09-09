// eslint-disable-next-line no-unused-vars
import { registerModelDeployment, ingestTelemetry, triggerRetraining } from '../server/operational-intelligence/mlops.js';
import { jest } from '@jest/globals';

describe('MLOps Drift Detection', () => {
  let ctx;
  const workspaceId = 'test-workspace';

  beforeEach(() => {
    ctx = {
      db: {
        query: jest.fn().mockImplementation((query, params) => {
           if (query && query.includes('INSERT INTO artifacts')) {
             const type = params[4];
             return Promise.resolve({ rows: [{ id: 'mock-id', artifact_type: type, workspace_id: workspaceId, data: JSON.parse(params[6] || '{}'), title: params[5] }] });
           }
           if (query && query.includes('INSERT INTO workspace_events')) {
             return Promise.resolve({ rows: [{ id: 'event-id' }] });
           }
           return Promise.resolve({ rows: [] });
        })
      },
      config: {}
    };
  });

  it('should register a model deployment', async () => {
    const deployment = await registerModelDeployment(ctx, {
      workspaceId,
      modelName: 'Test Model',
      version: '1.0',
      baseline: { features: { 'f1': { mean: 10, std: 2 } } }
    });
    expect(deployment.artifact_type).toBe('ml_model_deployment');
    expect(deployment.data.modelName).toBe('Test Model');
  });

  it('should detect drift when features are outside baseline', async () => {
    ctx.db.query
      .mockResolvedValueOnce({ rows: [{ id: 'deployment-id', artifact_type: 'ml_model_deployment', workspace_id: workspaceId, data: { baseline: { features: { 'f1': { mean: 10, std: 2 } } }, thresholds: { driftScore: 1.0 } } }] }) // resolveArtifact
      .mockResolvedValueOnce({}) // update deployment
      .mockResolvedValueOnce({ rows: [{ id: 'event-id' }] }) // telemetry event
      .mockResolvedValueOnce({ rows: [{ id: 'alert-id', artifact_type: 'ml_drift_alert', data: { maxDrift: 5 } }] }) // alert artifact
      .mockResolvedValueOnce({ rows: [{ id: 'alert-event-id' }] }) // alert event
      .mockResolvedValueOnce({ rows: [{ id: 'retrain-event-id' }] }); // retrain event

    const result = await ingestTelemetry(ctx, {
      workspaceId,
      deploymentId: 'deployment-id',
      features: { 'f1': 20 } // (20-10)/2 = 5 std dev drift
    });

    expect(result.maxDrift).toBe(5);
    // Check that an alert was created
    const alertCall = ctx.db.query.mock.calls.find(call => call[0].includes('INSERT INTO artifacts') && call[1][4] === 'ml_drift_alert');
    expect(alertCall).toBeDefined();
  });

  it('should not trigger alert when drift is below threshold', async () => {
    ctx.db.query
      .mockResolvedValueOnce({ rows: [{ id: 'deployment-id', artifact_type: 'ml_model_deployment', workspace_id: workspaceId, data: { baseline: { features: { 'f1': { mean: 10, std: 2 } } }, thresholds: { driftScore: 1.0 } } }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'event-id' }] });

    const result = await ingestTelemetry(ctx, {
      workspaceId,
      deploymentId: 'deployment-id',
      features: { 'f1': 11 } // (11-10)/2 = 0.5 std dev drift
    });

    expect(result.maxDrift).toBe(0.5);
    // Should NOT create alert artifact
    const alertCall = ctx.db.query.mock.calls.find(call => call[0].includes('INSERT INTO artifacts') && call[1][4] === 'ml_drift_alert');
    expect(alertCall).toBeUndefined();
  });

  it('denies foreign deployments before telemetry or retraining writes', async () => {
    ctx.db.query.mockResolvedValue({ rows: [{
      id: 'deployment-foreign',
      workspace_id: 'foreign-workspace',
      artifact_type: 'ml_model_deployment',
      data: { baseline: {}, thresholds: { driftScore: 1 } },
    }] });

    await expect(ingestTelemetry(ctx, {
      workspaceId,
      deploymentId: 'deployment-foreign',
      features: { f1: 20 },
    })).rejects.toThrow('Deployment not found');
    await expect(triggerRetraining(ctx, {
      workspaceId,
      deploymentId: 'deployment-foreign',
      reason: 'spoof',
      actor: { kind: 'user', id: '7' },
    })).rejects.toThrow('Deployment not found');

    expect(ctx.db.query).toHaveBeenCalledTimes(2);
    expect(ctx.db.query.mock.calls.every(([sql, params]) => (
      /workspace_id = \$2/.test(sql) && params[1] === workspaceId
    ))).toBe(true);
  });
});
