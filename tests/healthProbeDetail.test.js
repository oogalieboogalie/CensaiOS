import express from 'express';
import request from 'supertest';
import { mountHealthProbes } from '../server/health/probes.js';

const DB_ERROR = 'password authentication failed for user "homebase" at 10.0.0.5';
const MODEL_URL = 'http://10.9.8.7:11434/v1';

function status(over = {}) {
  return {
    ok: true,
    ready: true,
    degraded: false,
    degradedState: null,
    database: { connected: true, ready: true, error: null },
    qdrant: { ready: true, connected: true, error: null },
    modelProvider: { ready: true, baseUrl: MODEL_URL, model: 'secret-model', hasKey: true },
    taskWorker: { ready: true, degraded: false, message: 'Agent task worker: enabled', lastPollError: null },
    schedulerWorker: { ready: true, lastPollError: null },
    agentCardWorker: { ready: true, lastPollError: null },
    agentWakeupWorker: { ready: true, lastPollError: null },
    freeAiAccess: { ready: true, enabled: false },
    ...over,
  };
}

function appWith(maySeeDetail, current = status()) {
  const app = express();
  mountHealthProbes(app, {
    getSystemStatus: async () => current,
    getRunnerHealth: async () => ({ enabled: true, remote: false }),
    maySeeDetail,
  });
  return app;
}

describe('health probe detail', () => {
  test('an owner still gets the model address, workers, and a database error', async () => {
    const down = status({
      ok: false,
      ready: false,
      degraded: true,
      degradedState: 'database_unavailable',
      database: { connected: false, ready: false, error: DB_ERROR },
      taskWorker: {
        ready: false,
        degraded: true,
        degradedReason: 'database_unavailable',
        lastPollError: DB_ERROR,
        message: `Agent task worker: degraded (${DB_ERROR})`,
      },
    });
    const res = await request(appWith(async () => true, down)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: false,
      provider: MODEL_URL,
      model: 'secret-model',
      database: false,
      taskWorker: expect.any(Object),
      schedulerWorker: expect.any(Object),
      agentCardWorker: expect.any(Object),
      agentWakeupWorker: expect.any(Object),
    }));
    expect(res.body.modelProvider).toEqual(expect.objectContaining({ ready: true, baseUrl: MODEL_URL }));
    expect(res.body.databaseStatus).toEqual({
      ready: false,
      degraded: true,
      degradedReason: 'database_unavailable',
      error: DB_ERROR,
    });
    expect(res.body.runner).toEqual({ enabled: true, remote: false });
  });

  test('a signed-in non-owner and a failed owner check get the public answer', async () => {
    const leaked = status({
      ok: false,
      database: { connected: false, ready: false, error: DB_ERROR },
      qdrant: { ready: false, connected: false, error: 'connect ECONNREFUSED 10.1.2.3:6333' },
    });
    for (const maySeeDetail of [async () => false, async () => { throw new Error('db down'); }]) {
      const res = await request(appWith(maySeeDetail, leaked)).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: false });
      expect(JSON.stringify(res.body)).not.toContain(DB_ERROR);
      expect(JSON.stringify(res.body)).not.toContain(MODEL_URL);
    }
  });

  test('public /api/ready keeps readiness and drops addresses and error text', async () => {
    const down = status({
      ok: false,
      ready: false,
      degradedState: 'database_unavailable',
      database: { connected: false, ready: false, error: DB_ERROR },
      qdrant: { ready: false, connected: false, error: 'connect ECONNREFUSED 10.1.2.3:6333' },
      taskWorker: {
        ready: false,
        degradedReason: 'database_unavailable',
        lastPollError: DB_ERROR,
        message: `Agent task worker: degraded (${DB_ERROR})`,
      },
    });
    const res = await request(appWith(async () => false, down)).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.degradedState).toBe('database_unavailable');
    expect(res.body.database).toEqual({ connected: false, ready: false });
    expect(res.body.modelProvider).toEqual({ ready: true });
    expect(res.body.qdrant).toEqual({ ready: false, connected: false });
    expect(res.body.taskWorker).toEqual({ ready: false });
    expect(res.body.freeAiAccess).toEqual({ ready: true });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(DB_ERROR);
    expect(text).not.toContain(MODEL_URL);
    expect(text).not.toContain('secret-model');
    expect(text).not.toContain('10.1.2.3');
    expect(text).not.toContain('hasKey');
  });

  test('public /api/ready drops ownership errors, free-tier names, and row counts', async () => {
    const detail = status({
      memoryOwnership: {
        ready: false,
        legacyQuarantinedCount: 4,
        scopedCount: 9,
        error: DB_ERROR,
      },
      toolApprovalOwnership: {
        ready: true,
        totalCount: 11,
        pendingCount: 3,
        executingCount: 1,
        staleExecutingCount: 2,
      },
      freeAiAccess: {
        ready: true,
        enabled: true,
        provider: 'openrouter',
        model: 'secret-free-model',
      },
    });
    const owner = await request(appWith(async () => true, detail)).get('/api/ready');
    expect(owner.status).toBe(200);
    expect(owner.body.memoryOwnership.error).toBe(DB_ERROR);
    expect(owner.body.memoryOwnership.legacyQuarantinedCount).toBe(4);
    expect(owner.body.toolApprovalOwnership.pendingCount).toBe(3);
    expect(owner.body.toolApprovalOwnership.staleExecutingCount).toBe(2);
    expect(owner.body.freeAiAccess).toEqual(expect.objectContaining({
      provider: 'openrouter',
      model: 'secret-free-model',
    }));

    const pub = await request(appWith(async () => false, detail)).get('/api/ready');
    expect(pub.status).toBe(200);
    expect(pub.body.ok).toBe(true);
    expect(pub.body.ready).toBe(true);
    expect(pub.body.degraded).toBe(false);
    expect(pub.body.degradedState).toBeNull();
    expect(pub.body.memoryOwnership).toEqual({ ready: false });
    expect(pub.body.toolApprovalOwnership).toEqual({ ready: true });
    expect(pub.body.freeAiAccess).toEqual({ ready: true });
    const text = JSON.stringify(pub.body);
    expect(text).not.toContain(DB_ERROR);
    expect(text).not.toContain('secret-free-model');
    expect(text).not.toContain('openrouter');
    expect(text).not.toContain('legacyQuarantinedCount');
    expect(text).not.toContain('pendingCount');
    expect(text).not.toContain('staleExecutingCount');
    expect(text).not.toContain('enabled');
  });
});
