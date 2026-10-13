import { jest } from '@jest/globals';
import { ingestTelemetry, registerModelDeployment } from '../server/operational-intelligence/mlops.js';
import { applyPCA, calculateMMD } from '../server/operational-intelligence/drift-utils.js';

function dbWithResponses(responses = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      const next = responses.shift();
      if (typeof next === 'function') return next(sql, params);
      return next || { rows: [] };
    },
  };
}

function deployment(data) {
  return {
    rows: [{
      id: 'dep-id',
      workspace_id: 'workspace-1',
      artifact_type: 'ml_model_deployment',
      data,
    }],
  };
}

describe('MLOps high-dimensional drift detection', () => {
  test('applies PCA projection', () => {
    expect(applyPCA([1, 2, 3], [[0.5, 0.5, 0], [0, 0, 1]], [0, 0, 0])).toEqual([1.5, 3]);
  });

  test('separates similar and drifted sample sets with MMD', () => {
    const reference = [[1, 0], [1.1, 0.1], [0.9, -0.1]];
    const similar = [[1, 0.05], [1.05, 0], [0.95, -0.05]];
    const drifted = [[10, 10], [10.1, 10.1], [9.9, 9.9]];

    expect(calculateMMD(reference, similar, 1)).toBeLessThan(0.01);
    expect(calculateMMD(reference, drifted, 1)).toBeGreaterThan(0.5);
  });

  test('registers embedding drift defaults without breaking scalar deployments', async () => {
    const db = dbWithResponses([
      { rows: [{ id: 'dep-id', artifact_type: 'ml_model_deployment', data: {}, title: 'Model' }] },
      { rows: [{ id: 'event-id' }] },
    ]);

    await registerModelDeployment({ db }, {
      workspaceId: 'workspace-1',
      modelName: 'Model',
      version: '1.0',
      baseline: { features: { f1: { mean: 1, std: 1 } } },
    });

    const insertedData = JSON.parse(db.calls[0].params[6]);
    expect(insertedData.windowSize).toBe(10);
    expect(insertedData.buffer).toEqual([]);
  });

  test('buffers embeddings and emits MMD drift when the window is full', async () => {
    const db = dbWithResponses([
      deployment({
        baseline: {
          referenceSet: [[1, 1], [1.1, 1.1], [0.9, 0.9]],
          pcaComponents: [[1, 0], [0, 1]],
          sigma: 1,
        },
        thresholds: { driftScore: 0.1 },
        windowSize: 2,
        buffer: [[5, 5]],
      }),
      { rows: [] },
      { rows: [{ id: 'telemetry-event' }] },
      { rows: [{ id: 'alert-id', artifact_type: 'ml_drift_alert', data: {} }] },
      { rows: [{ id: 'alert-event' }] },
      { rows: [{ id: 'retrain-event' }] },
    ]);

    const result = await ingestTelemetry({ db, config: {} }, {
      workspaceId: 'workspace-1',
      deploymentId: 'dep-id',
      features: { embedding: [5.1, 5.1] },
    });

    expect(result.maxDrift).toBeGreaterThan(0.1);
    expect(result.driftResults.embedding_mmd).toBeDefined();
    expect(JSON.parse(db.calls[1].params[0]).buffer).toEqual([]);
  });

  test('sends configured webhooks only when drift alerting is enabled', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    const db = dbWithResponses([
      deployment({
        baseline: { features: { f1: { mean: 10, std: 1 } } },
        thresholds: { driftScore: 0.1 },
      }),
      { rows: [] },
      { rows: [{ id: 'telemetry-event' }] },
      { rows: [{ id: 'alert-id', artifact_type: 'ml_drift_alert', data: {} }] },
      { rows: [{ id: 'alert-event' }] },
      { rows: [{ id: 'retrain-event' }] },
    ]);

    try {
      await ingestTelemetry({
        db,
        config: { mlopsWebhooks: [{ type: 'slack', url: 'https://example.test/slack' }] },
      }, {
        workspaceId: 'workspace-1',
        deploymentId: 'dep-id',
        features: { f1: 20 },
      });
    } finally {
      global.fetch = originalFetch;
    }

    expect(mockFetch).toHaveBeenCalledWith('https://example.test/slack', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('ML Drift Alert'),
    }));
  });
});
