import { jest } from '@jest/globals';

const runRestartSelfCheck = (await import('../server/agent-wakeups/restartSelfCheck.js'))
  .runRestartSelfCheck;
const { RESTART_SELF_CHECK_EVENT_TYPE } = await import(
  '../server/agent-wakeups/restartSelfCheck.js'
);

const baseLog = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

function fakeDb({ withAgentCount = true, dbFails = false, eventId = 'evt-restart-1' } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'SELECT 1') {
        if (dbFails) throw new Error('connection refused');
        return { rows: [] };
      }
      if (sql.includes('FROM agents')) {
        if (!withAgentCount) throw new Error('agents table missing');
        return { rows: [{ count: 7 }] };
      }
      if (sql.includes('INSERT INTO workspace_events')) {
        return {
          rows: [{
            id: eventId,
            event_type: params[1],
            actor_kind: params[2],
            actor_id: params[3],
            payload: params[8],
          }],
        };
      }
      return { rows: [] };
    },
  };
}

describe('restart self-check', () => {
  test('emits ok verdict with full payload when db and sibling workers are healthy', async () => {
    const db = fakeDb();
    const log = baseLog();
    const processStartedAt = new Date('2026-06-23T12:00:00.000Z');
    const getSiblingWorkerStatuses = jest.fn(async () => [
      { name: 'taskWorker', running: true },
      { name: 'schedulerWorker', running: true },
    ]);
    const now = () => new Date('2026-06-23T12:00:27.500Z');

    const result = await runRestartSelfCheck({
      db,
      log,
      processStartedAt,
      scheduledDelayMs: 25000,
      workspaceId: 'default',
      actor: { kind: 'system', id: 'restart-self-check' },
      getSiblingWorkerStatuses,
      now,
    });

    expect(result.event).toEqual(
      expect.objectContaining({ id: 'evt-restart-1', event_type: RESTART_SELF_CHECK_EVENT_TYPE })
    );
    expect(result.error).toBeNull();
    expect(result.payload).toEqual({
      processStartedAt: '2026-06-23T12:00:00.000Z',
      scheduledDelayMs: 25000,
      checkCompletedAt: '2026-06-23T12:00:27.500Z',
      dbOk: true,
      agentsCount: 7,
      siblingWorkersActive: 2,
      verdict: 'ok',
      scheduledAt: '2026-06-23T12:00:27.500Z',
      elapsedMs: 27500,
      dbError: null,
      siblingProbeError: null,
    });
    expect(result.payload).toHaveProperty('processStartedAt');
    expect(result.payload).toHaveProperty('scheduledDelayMs');
    expect(result.payload).toHaveProperty('checkCompletedAt');
    expect(result.payload).toHaveProperty('dbOk');
    expect(result.payload).toHaveProperty('agentsCount');
    expect(result.payload).toHaveProperty('siblingWorkersActive');
    expect(result.payload).toHaveProperty('verdict');
    expect(getSiblingWorkerStatuses).toHaveBeenCalledTimes(1);
    // The SELECT 1 probe runs before the agents count query.
    expect(db.calls[0].sql).toBe('SELECT 1');
    expect(db.calls[1].sql).toContain('FROM agents');
  });

  test('returns degraded verdict when db probe fails', async () => {
    const db = fakeDb({ dbFails: true });
    const log = baseLog();
    const processStartedAt = new Date('2026-06-23T12:00:00.000Z');

    const result = await runRestartSelfCheck({
      db,
      log,
      processStartedAt,
      scheduledDelayMs: 25000,
      getSiblingWorkerStatuses: async () => [
        { name: 'taskWorker', running: false },
      ],
      now: () => new Date('2026-06-23T12:00:30.000Z'),
    });

    expect(result.payload.dbOk).toBe(false);
    expect(result.payload.agentsCount).toBe(0);
    expect(result.payload.verdict).toBe('degraded');
    expect(result.payload.dbError).toMatch(/connection refused/);
    expect(result.payload.siblingWorkersActive).toBe(0);
    // Should NOT have queried the agents table when db is down.
    expect(db.calls.some((c) => c.sql.includes('FROM agents'))).toBe(false);
  });

  test('does not throw when workspace event emit fails (best-effort)', async () => {
    const db = {
      calls: [],
      async query(sql) {
        db.calls.push(sql);
        if (sql === 'SELECT 1') return { rows: [] };
        if (sql.includes('INSERT INTO workspace_events')) {
          throw new Error('workspace_events table missing');
        }
        return { rows: [] };
      },
    };
    const log = baseLog();

    const result = await runRestartSelfCheck({
      db,
      log,
      processStartedAt: new Date('2026-06-23T12:00:00.000Z'),
      scheduledDelayMs: 25000,
      getSiblingWorkerStatuses: async () => [],
      now: () => new Date('2026-06-23T12:00:25.000Z'),
    });

    expect(result.event).toBeNull();
    expect(result.error).toMatch(/workspace_events table missing/);
    expect(result.payload.verdict).toBe('ok');
    expect(log.error).toHaveBeenCalledWith(
      'restart self-check: workspace event emit failed',
      expect.objectContaining({ error: expect.any(String), verdict: 'ok' })
    );
  });

  test('rejects invalid input early', async () => {
    const log = baseLog();
    await expect(runRestartSelfCheck({ log, processStartedAt: new Date(), scheduledDelayMs: 0 }))
      .rejects.toThrow('db is required');
    await expect(runRestartSelfCheck({ db: fakeDb(), processStartedAt: new Date(), scheduledDelayMs: 0 }))
      .rejects.toThrow('log is required');
    await expect(runRestartSelfCheck({ db: fakeDb(), log, processStartedAt: 'not-a-date', scheduledDelayMs: 0 }))
      .rejects.toThrow('processStartedAt');
    await expect(runRestartSelfCheck({ db: fakeDb(), log, processStartedAt: new Date(), scheduledDelayMs: -1 }))
      .rejects.toThrow('scheduledDelayMs');
  });

  test('counts only sibling workers whose status reports running: true', async () => {
    const db = fakeDb();
    const result = await runRestartSelfCheck({
      db,
      log: baseLog(),
      processStartedAt: new Date('2026-06-23T12:00:00.000Z'),
      scheduledDelayMs: 25000,
      getSiblingWorkerStatuses: async () => [
        { name: 'taskWorker', running: true },
        { name: 'schedulerWorker', running: false },
        { name: 'logCleanup', running: true },
        { name: 'broken', running: undefined },
      ],
      now: () => new Date('2026-06-23T12:00:25.000Z'),
    });
    expect(result.payload.siblingWorkersActive).toBe(2);
  });
});