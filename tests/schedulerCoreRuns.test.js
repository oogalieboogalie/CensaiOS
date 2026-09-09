import { jest } from '@jest/globals';
import { enqueueCoreScheduleRun } from '../server/scheduler/coreRuns.js';

describe('core-agent schedule enqueue', () => {
  test('atomically links one typed schedule-cause AgentCard run', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = { query, release: jest.fn() };
    const db = { connect: jest.fn().mockResolvedValue(client) };
    const loadCard = jest.fn().mockResolvedValue({ id: 'agent:censai', owner_id: null });
    const createCardRun = jest.fn().mockResolvedValue({ runId: 'run-1', status: 'queued' });
    const schedule = {
      id: 'schedule-1',
      project_id: 'workspace-1',
      workspace_id: 'workspace-owned-1',
      created_by_user_id: 7,
      task_text: 'Prepare the review.',
    };

    await expect(enqueueCoreScheduleRun(schedule, 'censai', {
      db, loadCard, createCardRun,
    })).resolves.toEqual({ runId: 'run-1', status: 'queued' });

    expect(createCardRun).toHaveBeenCalledWith(expect.objectContaining({
      db: client,
      callerId: 'user:7',
      principal: 'system:scheduler',
      cause: { kind: 'schedule', scheduleId: 'schedule-1' },
      options: { workspaceId: 'workspace-owned-1' },
      runMetadata: { scheduleId: 'schedule-1', userId: 7 },
    }));
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('SET agent_id=$1, last_run_id=$2'),
      ['censai', 'run-1', 'schedule-1'],
    ]);
    expect(query.mock.calls[2][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects a missing built-in card before opening a transaction', async () => {
    const db = { connect: jest.fn() };
    await expect(enqueueCoreScheduleRun(
      {
        id: 'schedule-1',
        workspace_id: 'workspace-owned-1',
        created_by_user_id: 7,
        task_text: 'Test.',
      },
      'ghost',
      { db, loadCard: jest.fn().mockResolvedValue(null) }
    )).rejects.toThrow('is not registered');
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('rejects an unowned legacy schedule before loading a card', async () => {
    const db = { connect: jest.fn() };
    const loadCard = jest.fn();
    await expect(enqueueCoreScheduleRun(
      { id: 'legacy-schedule', task_text: 'Do not run.' },
      'censai',
      { db, loadCard }
    )).rejects.toThrow('authenticated workspace owner');
    expect(loadCard).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });
});
