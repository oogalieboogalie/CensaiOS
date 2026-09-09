import { jest } from '@jest/globals';
import {
  createRun,
  startRun,
  completeRun,
  failRun,
  attachArtifactToRun,
  recordRunAction,
} from '../server/runs/lifecycle.js';

function createDb(id = 'test-id') {
  return { query: jest.fn().mockResolvedValue({ rows: [{ id }] }) };
}

describe('runs lifecycle', () => {
  test('createRun inserts into runs with tenant_id and returns { runId }', async () => {
    const db = createDb();
    const result = await createRun({
      db, tenantId: 'tenant-7', workspaceId: 'ws-1', actor: 'user:42',
      principal: 'user:42', runtimeMode: 'async', metadata: { foo: 'bar' },
      cause: { kind: 'user_dispatch', userDispatchRef: 'dispatch-1' },
    });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO runs');
    expect(sql).toContain("VALUES ($1, $2, $3, $4, $5, 'pending', $6)");
    expect(values).toEqual(['tenant-7', 'ws-1', 'user:42', 'user:42', 'async', { foo: 'bar' }]);
    expect(result).toEqual({ runId: 'test-id' });
  });

  test('createRun defaults runtime_mode to sync and metadata to {}', async () => {
    const db = createDb();
    await createRun({
      db, tenantId: 't', workspaceId: 'w',
      cause: { kind: 'workspace_event', workspaceEventId: 'event-1' },
    });
    const values = db.query.mock.calls[0][1];
    expect(values[4]).toBe('sync');
    expect(values[5]).toEqual({});
  });

  test('startRun UPDATEs runs to status=running with started_at=NOW()', async () => {
    const db = createDb();
    await startRun({ db, runId: 'abc' });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE runs/i);
    expect(sql).toContain("status = 'running'");
    expect(sql).toContain('started_at = NOW()');
    expect(values).toEqual(['abc']);
  });

  test('completeRun UPDATEs runs to status=succeeded with completed_at=NOW()', async () => {
    const db = createDb();
    await completeRun({ db, runId: 'abc' });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE runs/i);
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain('completed_at = NOW()');
  });

  test('completeRun with metadata merges the JSONB patch', async () => {
    const db = createDb();
    await completeRun({ db, runId: 'abc', metadata: { summary: 'done' } });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('metadata');
    expect(values).toEqual(['abc', { summary: 'done' }]);
  });

  test('failRun INSERTs the error message into a run_step then marks the run failed', async () => {
    const db = createDb();
    await failRun({ db, runId: 'abc', error: 'boom' });
    const [insertSql, insertValues] = db.query.mock.calls[0];
    expect(insertSql).toContain('INSERT INTO run_steps');
    expect(insertSql).toContain("'system.failure'");
    expect(insertValues[0]).toBe('abc');
    expect(insertValues[1]).toEqual({ message: 'boom' });
    const [updateSql] = db.query.mock.calls[1];
    expect(updateSql).toContain("status = 'failed'");
    expect(updateSql).toContain('completed_at = NOW()');
  });

  test('failRun normalizes Error objects into { message, name, stack }', async () => {
    const db = createDb();
    await failRun({ db, runId: 'abc', error: new Error('kapow') });
    const payload = db.query.mock.calls[0][1][1];
    expect(payload.message).toBe('kapow');
    expect(payload.name).toBe('Error');
    expect(typeof payload.stack).toBe('string');
  });

  test('failRun preserves structured error object fields with a message', async () => {
    const db = createDb();
    await failRun({ db, runId: 'abc', error: { message: 'nope', code: 'E_BANG' } });
    const payload = db.query.mock.calls[0][1][1];
    expect(payload.message).toBe('nope');
    expect(payload.code).toBe('E_BANG');
  });

  test('attachArtifactToRun INSERTs into run_artifacts and returns { artifactId }', async () => {
    const db = createDb('art-1');
    const result = await attachArtifactToRun({
      db, runId: 'abc', stepId: 'step-1', kind: 'log', ref: 's3://x', metadata: { bytes: 42 },
    });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO run_artifacts');
    expect(values).toEqual(['abc', 'step-1', 'log', 's3://x', { bytes: 42 }]);
    expect(result).toEqual({ artifactId: 'art-1' });
  });

  test('attachArtifactToRun defaults stepId to null and metadata to {}', async () => {
    const db = createDb();
    await attachArtifactToRun({ db, runId: 'abc', kind: 'metric', ref: 'cpu' });
    const values = db.query.mock.calls[0][1];
    expect(values[1]).toBeNull();
    expect(values[4]).toEqual({});
  });

  test('recordRunAction stores an action against its causal run', async () => {
    const db = createDb();
    await recordRunAction({ db, runId: 'abc', sequence: 1, name: 'task.execute' });
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO run_steps');
    expect(values).toEqual(['abc', 1, 'task.execute', 'succeeded', {}]);
  });

  test('module exports lifecycle functions and causal-chain reader', async () => {
    const mod = await import('../server/runs/lifecycle.js');
    for (const name of [
      'createRun', 'startRun', 'completeRun', 'failRun', 'attachArtifactToRun',
      'recordRunAction', 'loadRunCausalChain',
    ]) {
      expect(typeof mod[name]).toBe('function');
    }
  });
});
