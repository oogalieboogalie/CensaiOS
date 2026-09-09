import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRun, loadRunCausalChain } from '../server/runs/lifecycle.js';
import { normalizeRunCause } from '../server/runs/causality.js';

function createDb() {
  return { query: jest.fn() };
}

describe('run causality', () => {
  test.each([
    ['parent run', { kind: 'parent_run', parentRunId: 'run-parent' }, 'run-parent', null, null, null, null],
    ['workspace event', { kind: 'workspace_event', workspaceEventId: 'event-1' }, null, 'event-1', null, null, null],
    ['user dispatch', { kind: 'user_dispatch', userDispatchRef: 'command:publish:1' }, null, null, 'command:publish:1', null, null],
    ['agent message', { kind: 'agent_message', sourceMessageId: 'message-1' }, null, null, null, 'message-1', null],
    ['schedule', { kind: 'schedule', scheduleId: 'schedule-1' }, null, null, null, null, 'schedule-1'],
  ])('createRun persists a % root cause', async (
    _label, cause, parentRunId, workspaceEventId, userDispatchRef, sourceMessageId, scheduleId
  ) => {
    const db = createDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'run-child' }] })
      .mockResolvedValueOnce({ rows: [{ run_id: 'run-child' }] });

    await createRun({ db, cause });

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO run_causes');
    expect(db.query.mock.calls[1][1]).toEqual([
      'run-child', cause.kind, parentRunId, workspaceEventId, userDispatchRef,
      sourceMessageId, scheduleId, {},
    ]);
  });

  test('queries a child-to-root causal chain in order', async () => {
    const db = createDb();
    db.query.mockResolvedValue({ rows: [
      { depth: 0, run_id: 'child', cause_kind: 'parent_run', parent_run_id: 'parent' },
      { depth: 1, run_id: 'parent', cause_kind: 'parent_run', parent_run_id: 'root' },
      { depth: 2, run_id: 'root', cause_kind: 'workspace_event', workspace_event_id: 'event-1' },
    ] });

    const chain = await loadRunCausalChain({ db, runId: 'child' });

    expect(db.query.mock.calls[0][0]).toContain('WITH RECURSIVE causal_chain');
    expect(db.query.mock.calls[0][0]).toContain('JOIN run_causes cause ON cause.run_id = causal_chain.parent_run_id');
    expect(db.query.mock.calls[0][1]).toEqual(['child', 50]);
    expect(chain.map(entry => entry.run_id)).toEqual(['child', 'parent', 'root']);
    expect(chain.at(-1)).toMatchObject({ cause_kind: 'workspace_event', workspace_event_id: 'event-1' });
  });

  test('reuses an existing transaction client instead of reconnecting it', async () => {
    const transactionClient = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'run-child' }] })
        .mockResolvedValueOnce({ rows: [{ run_id: 'run-child' }] }),
    };

    await createRun({
      db: transactionClient,
      cause: { kind: 'agent_message', sourceMessageId: 'message-1' },
    });

    expect(transactionClient.connect).not.toHaveBeenCalled();
    expect(transactionClient.release).not.toHaveBeenCalled();
    expect(transactionClient.query).toHaveBeenCalledTimes(2);
  });

  test('rejects missing and malformed run causes before inserting a run', () => {
    expect(() => normalizeRunCause()).toThrow('cause is required');
    expect(() => normalizeRunCause({ kind: 'parent_run' })).toThrow('cause.parentRunId is required');
    expect(() => normalizeRunCause({ kind: 'agent_message' })).toThrow('cause.sourceMessageId is required');
    expect(() => normalizeRunCause({ kind: 'schedule' })).toThrow('cause.scheduleId is required');
    expect(() => normalizeRunCause({ kind: 'unknown', userDispatchRef: 'dispatch-1' }))
      .toThrow('Unsupported cause kind: unknown');
  });

  test('migration enforces one immutable, typed cause per run', async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const sql = await fs.promises.readFile(path.resolve(__dirname, '..', 'docker', '030-run-causality.sql'), 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS run_causes/i);
    expect(sql).toMatch(/run_id\s+UUID PRIMARY KEY REFERENCES runs/i);
    expect(sql).toMatch(/cause_kind IN \('parent_run', 'workspace_event', 'user_dispatch'\)/i);
    expect(sql).toMatch(/idx_run_causes_parent_run/i);

    const autonomousSql = await fs.promises.readFile(
      path.resolve(__dirname, '..', 'docker', '031-autonomous-run-causes.sql'),
      'utf8'
    );
    expect(autonomousSql).toMatch(/'agent_message', 'schedule'/i);
    expect(autonomousSql).toMatch(/source_message_id UUID REFERENCES agent_messages/i);
    expect(autonomousSql).toMatch(/schedule_id UUID REFERENCES schedules/i);
    expect(autonomousSql).toMatch(/agent_wakeups[\s\S]+run_id UUID UNIQUE REFERENCES runs/i);
  });
});
