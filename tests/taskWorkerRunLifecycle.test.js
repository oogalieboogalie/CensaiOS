import { jest } from '@jest/globals';

const db = { query: jest.fn() };
const createRun = jest.fn();
const startRun = jest.fn();
const completeRun = jest.fn();
const failRun = jest.fn();
const recordRunAction = jest.fn();

jest.unstable_mockModule('../server/db.js', () => ({ default: db }));
jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({
  createRun,
  startRun,
  completeRun,
  failRun,
  recordRunAction,
}));

const { runTaskWithLifecycle } = await import('../server/task-worker/runLifecycle.js');

const task = {
  id: 'task-7', assignee_id: 'atlas', workspace_id: 'workspace-1', created_by_user_id: 7,
};

beforeEach(() => {
  jest.clearAllMocks();
  createRun.mockResolvedValue({ runId: 'run-7' });
  startRun.mockResolvedValue(undefined);
  completeRun.mockResolvedValue(undefined);
  failRun.mockResolvedValue(undefined);
  recordRunAction.mockResolvedValue(undefined);
});

describe('task worker run lifecycle', () => {
  test('roots a completed background run in its durable task dispatch', async () => {
    const executeTask = jest.fn(async () => ({ status: 'succeeded', result: 'done' }));

    const result = await runTaskWithLifecycle({ task, executeTask });

    expect(result).toEqual({ runId: 'run-7', outcome: { status: 'succeeded', result: 'done' } });
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      db,
      actor: 'agent:atlas',
      principal: 'user:7',
      workspaceId: 'workspace-1',
      runtimeMode: 'background',
      cause: {
        kind: 'user_dispatch',
        userDispatchRef: 'agent_task:task-7',
        metadata: { agentTaskId: 'task-7' },
      },
    }));
    expect(startRun).toHaveBeenCalledWith({ db, runId: 'run-7' });
    expect(recordRunAction).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-7',
      name: 'agent_task.execute',
      status: 'succeeded',
    }));
    expect(completeRun).toHaveBeenCalledWith({ db, runId: 'run-7', metadata: { agentTaskId: 'task-7' } });
    expect(failRun).not.toHaveBeenCalled();
  });

  test('records a failed task run and preserves the failure cause', async () => {
    const executeTask = jest.fn(async () => ({ status: 'failed', error: 'model timed out' }));

    await runTaskWithLifecycle({ task, executeTask });

    expect(recordRunAction).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(failRun).toHaveBeenCalledWith({ db, runId: 'run-7', error: 'model timed out' });
    expect(completeRun).not.toHaveBeenCalled();
  });
});
