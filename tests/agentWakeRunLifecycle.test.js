import { jest } from '@jest/globals';

const createRun = jest.fn();
const startRun = jest.fn();
const recordRunAction = jest.fn();
const completeRun = jest.fn();
const failRun = jest.fn();

jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({
  createRun,
  startRun,
  recordRunAction,
  completeRun,
  failRun,
}));
jest.unstable_mockModule('../server/runs/causality.js', () => ({
  withRunTransaction: async (_db, work) => work(_db),
}));

const { beginWakeupRun, completeWakeupRun } = await import('../server/agent-wakeups/runLifecycle.js');

const wake = {
  id: 'wake-1', message_id: 'message-1', agent_id: 'atlas', sender_id: 'architect',
  phase: 'initial', attempts: 1,
  workspace_id: 'workspace-1', created_by_user_id: 7,
};

describe('agent wakeup run lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates and attaches one typed message-cause run', async () => {
    const db = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ run_id: null }] })
      .mockResolvedValueOnce({ rows: [] }) };
    createRun.mockResolvedValueOnce({ runId: 'run-1' });

    await expect(beginWakeupRun(wake, db)).resolves.toBe('run-1');

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      db,
      actor: 'agent:atlas',
      principal: 'user:7',
      workspaceId: 'workspace-1',
      cause: { kind: 'agent_message', sourceMessageId: 'message-1' },
    }));
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE agent_wakeups SET run_id'), ['run-1', 'wake-1']
    );
    expect(startRun).toHaveBeenCalledWith({ db, runId: 'run-1' });
  });

  test('reuses the attached run and records only safe tool names', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ run_id: 'run-existing' }] }) };
    await expect(beginWakeupRun(wake, db)).resolves.toBe('run-existing');
    expect(createRun).not.toHaveBeenCalled();

    await completeWakeupRun({
      db,
      runId: 'run-existing',
      wake,
      outcome: { text: 'Done.', toolCalls: ['project_read'] },
    });
    expect(recordRunAction).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ toolCalls: ['project_read'] }),
    }));
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ response: 'Done.', toolCalls: ['project_read'] }),
    }));
  });
});
