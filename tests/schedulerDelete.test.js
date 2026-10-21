// Delete a schedule that has already run. The run row stays.
// The database half runs when MEMORY_TEST_DATABASE_URL or the local docker
// database on port 5433 answers. It is skipped when neither is reachable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { jest } from '@jest/globals';
import { onLogRecord } from '../server/logger.js';
import { deleteOwnedSchedule } from '../server/scheduler/store.js';
import { recordScheduleRunOutcome } from '../server/scheduler/lastRun.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = (name) => path.join(here, '..', 'docker', name);

async function reachableDatabaseUrl() {
  const candidate = process.env.MEMORY_TEST_DATABASE_URL
    || 'postgresql://homebase:homebase@127.0.0.1:5433/homebase';
  const client = new pg.Client({ connectionString: candidate, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return candidate;
  } catch {
    return '';
  } finally {
    await client.end().catch(() => {});
  }
}

const url = await reachableDatabaseUrl();
const maybe = url ? describe : describe.skip;

function listen(message) {
  const records = [];
  const stop = onLogRecord((record) => {
    if (record.namespace === 'scheduler' && record.message === message) records.push(record);
  });
  return { records, stop };
}

describe('scheduler delete log', () => {
  test('the migration keeps the run and lets the schedule go', () => {
    const sql = fs.readFileSync(sqlPath('075-scheduler-run-link.sql'), 'utf8');
    expect(sql).toMatch(/DROP CONSTRAINT/i);
    expect(sql).toMatch(/run_causes/);
    expect(sql).toMatch(/schedule_id/);
    expect(sql).toMatch(/last_result TEXT/);
    expect(sql).toMatch(/last_run_at TIMESTAMPTZ/);
    expect(sql).not.toMatch(/ON DELETE RESTRICT/i);
  });

  test('a delete log names the schedule and the agent, not the task', async () => {
    const { records, stop } = listen('schedule delete');
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ agent_id: 'censai' }] }),
    };
    try {
      const worked = await deleteOwnedSchedule('schedule-9', {
        db, userId: 7, workspaceId: 'workspace-1',
      });
      expect(worked).toBe(true);
    } finally {
      stop();
    }
    expect(records).toHaveLength(1);
    expect(records[0].meta).toEqual({
      scheduleId: 'schedule-9', agent: 'censai', worked: true, why: 'deleted',
    });
    expect(JSON.stringify(records[0])).not.toMatch(/task|lead/i);
  });

  test('a finished run log names the schedule and skips the answer', async () => {
    const { records, stop } = listen('schedule run finished');
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    const answer = 'Monday update: 3 new leads';
    try {
      await recordScheduleRunOutcome({
        db, scheduleId: 'schedule-9', runId: 'run-9', agentId: 'censai', answer,
      });
    } finally {
      stop();
    }
    expect(records).toHaveLength(1);
    expect(records[0].meta).toEqual({
      scheduleId: 'schedule-9', agent: 'censai', runId: 'run-9', worked: true, why: 'finished',
    });
    expect(JSON.stringify(records[0])).not.toContain(answer);
    expect(db.query.mock.calls[0][0]).toMatch(/last_result/);
    expect(db.query.mock.calls[0][0]).toMatch(/last_run_at/);
    expect(db.query.mock.calls[0][1][2]).toBe(answer);
  });

  test('a failed run logs that it failed and does not store an answer', async () => {
    const { records, stop } = listen('schedule run failed');
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    try {
      await recordScheduleRunOutcome({
        db, scheduleId: 'schedule-9', runId: 'run-9', agentId: 'atlas', failed: true,
        answer: 'Monday update: 3 new leads',
      });
    } finally {
      stop();
    }
    expect(records[0].meta).toMatchObject({ agent: 'atlas', worked: false, why: 'failed' });
    expect(JSON.stringify(records[0])).not.toContain('Monday update');
    expect(db.query.mock.calls[0][1][1]).toBe(true);
  });
});

maybe('scheduler delete on a real database', () => {
  let db;
  let userId;
  let workspaceId;
  const runIds = [];

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 4000 });
    await db.query('SELECT 1');
    await db.query(fs.readFileSync(sqlPath('031-autonomous-run-causes.sql'), 'utf8'));
    await db.query(fs.readFileSync(sqlPath('075-scheduler-run-link.sql'), 'utf8'));
    const user = await db.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [`sam.example+card50-${Date.now()}@example.test`, 'Sam Example']
    );
    userId = user.rows[0].id;
    workspaceId = `ws-card50-${Date.now()}`;
    await db.query(
      'INSERT INTO workspaces (id, name, created_by_user_id) VALUES ($1, $2, $3)',
      [workspaceId, 'Example board', userId]
    );
  });

  afterAll(async () => {
    if (!db) return;
    if (runIds.length) {
      await db.query('DELETE FROM runs WHERE id = ANY($1::uuid[])', [runIds]).catch(() => {});
    }
    if (workspaceId) await db.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]).catch(() => {});
    if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
    await db.end();
  });

  async function seedSchedule(taskText) {
    const schedule = await db.query(
      `INSERT INTO schedules (
         agent_id, task_text, scheduled_time, scheduled_date, status,
         workspace_id, created_by_user_id
       ) VALUES ('censai', $1, '9:00 AM', '2026-10-20', 'completed', $2, $3)
       RETURNING id`,
      [taskText, workspaceId, userId]
    );
    const scheduleId = schedule.rows[0].id;
    const run = await db.query(
      `INSERT INTO runs (workspace_id, actor, principal, status, metadata)
       VALUES ($1, 'agent:censai', 'system:scheduler', 'succeeded', $2::jsonb)
       RETURNING id`,
      [workspaceId, JSON.stringify({ scheduleId })]
    );
    const runId = run.rows[0].id;
    runIds.push(runId);
    await db.query(
      `INSERT INTO run_causes (run_id, cause_kind, schedule_id) VALUES ($1, 'schedule', $2)`,
      [runId, scheduleId]
    );
    await db.query('UPDATE schedules SET last_run_id = $2 WHERE id = $1', [scheduleId, runId]);
    return { scheduleId, runId };
  }

  test('deletes a schedule that has a run and keeps the run row', async () => {
    const taskText = 'Check the Monday leads for Sam Example';
    const { scheduleId, runId } = await seedSchedule(taskText);
    const { records, stop } = listen('schedule delete');
    let worked;
    try {
      worked = await deleteOwnedSchedule(scheduleId, { db, userId, workspaceId });
    } finally {
      stop();
    }
    expect(worked).toBe(true);
    const schedule = await db.query('SELECT id FROM schedules WHERE id = $1', [scheduleId]);
    const run = await db.query('SELECT id, status FROM runs WHERE id = $1', [runId]);
    const cause = await db.query(
      'SELECT schedule_id, cause_kind FROM run_causes WHERE run_id = $1',
      [runId]
    );
    const link = await db.query(
      `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE t.relname = 'run_causes' AND c.contype = 'f' AND a.attname = 'schedule_id'`
    );
    expect(schedule.rows).toEqual([]);
    expect(run.rows).toEqual([{ id: runId, status: 'succeeded' }]);
    expect(cause.rows).toEqual([{ schedule_id: scheduleId, cause_kind: 'schedule' }]);
    expect(link.rows).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].meta).toMatchObject({
      scheduleId, agent: 'censai', worked: true, why: 'deleted',
    });
    expect(JSON.stringify(records[0])).not.toContain(taskText);
  });

  test('saves the latest answer and time where the card can read them', async () => {
    const answer = 'Monday update: 3 new leads';
    const { scheduleId, runId } = await seedSchedule('Count new leads');
    const { records, stop } = listen('schedule run finished');
    try {
      await recordScheduleRunOutcome({
        db, scheduleId, runId, agentId: 'censai', answer,
      });
    } finally {
      stop();
    }
    const saved = await db.query(
      'SELECT last_result, last_run_at, last_error FROM schedules WHERE id = $1',
      [scheduleId]
    );
    expect(saved.rows[0].last_result).toBe(answer);
    expect(saved.rows[0].last_error).toBeNull();
    expect(saved.rows[0].last_run_at).toBeTruthy();
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records[0])).not.toContain(answer);
    expect(JSON.stringify(records[0])).not.toContain('Count new leads');
  });
});
