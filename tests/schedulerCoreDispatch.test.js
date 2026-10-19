import { jest } from '@jest/globals';

const claimNextDueSchedule = jest.fn();
const getRunningScheduleRuns = jest.fn();
const updateSchedule = jest.fn();
const createAgentTask = jest.fn();
const getAllSubAgents = jest.fn();
const getAgents = jest.fn();
const enqueueCoreScheduleRun = jest.fn();
const gateAgentWakeUp = jest.fn();

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/memory/schedules.js', () => ({
  claimNextDueSchedule,
  getRunningScheduleRuns,
  updateSchedule,
}));
jest.unstable_mockModule('../server/memory/tasks.js', () => ({ createAgentTask }));
jest.unstable_mockModule('../server/memory/subagents.js', () => ({ getAllSubAgents }));
jest.unstable_mockModule('../server/memory/core/agents.js', () => ({ getAgents }));
jest.unstable_mockModule('../server/scheduler/coreRuns.js', () => ({ enqueueCoreScheduleRun }));
jest.unstable_mockModule('../server/wakeUps/store.js', () => ({ gateAgentWakeUp }));
jest.unstable_mockModule('../server/memory/schedules_utils.js', () => ({
  calculateNextRun: jest.fn(() => new Date('2026-07-20T12:00:00Z')),
}));

const {
  reconcileCoreScheduleRuns,
  stopSchedulerWorkerForTests,
  tickScheduler,
} = await import('../server/schedulerWorker.js');

describe('scheduler core-agent dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopSchedulerWorkerForTests();
    getRunningScheduleRuns.mockResolvedValue([]);
    claimNextDueSchedule.mockResolvedValue(null);
    getAgents.mockResolvedValue([]);
    getAllSubAgents.mockResolvedValue([]);
    updateSchedule.mockResolvedValue({});
  });

  test('queues a core schedule through the AgentCard worker and leaves it running', async () => {
    claimNextDueSchedule.mockResolvedValueOnce({
      id: 'schedule-1', agent_id: 'censai', task_text: 'Review the product.', repeat_enabled: false,
    });
    getAgents.mockResolvedValueOnce([{ id: 'censai', name: 'Censai' }]);
    enqueueCoreScheduleRun.mockResolvedValueOnce({ runId: 'run-1' });

    await tickScheduler();

    expect(enqueueCoreScheduleRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'schedule-1' }), 'censai'
    );
    expect(createAgentTask).not.toHaveBeenCalled();
    expect(updateSchedule).not.toHaveBeenCalledWith(
      'schedule-1', expect.objectContaining({ status: 'completed' })
    );
  });

  test('a wake-up Censai set runs only when the gate lets it, otherwise it is held', async () => {
    const due = { id: 'wake-1', agent_id: 'echo', set_by_agent: 'censai', task_text: 'Sales sheet.' };
    getAgents.mockResolvedValue([{ id: 'echo', name: 'Echo' }]);
    const hold = { status: 'inactive', last_error: 'Wake-ups are off for Censai, so this one is paused.' };
    claimNextDueSchedule.mockResolvedValueOnce(due);
    gateAgentWakeUp.mockResolvedValueOnce(hold);
    await tickScheduler();
    expect(updateSchedule).toHaveBeenCalledWith('wake-1', hold);
    expect(enqueueCoreScheduleRun).not.toHaveBeenCalled();

    claimNextDueSchedule.mockResolvedValueOnce(due);
    gateAgentWakeUp.mockResolvedValueOnce(null);
    enqueueCoreScheduleRun.mockResolvedValueOnce({ runId: 'run-2' });
    await tickScheduler();
    expect(enqueueCoreScheduleRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'wake-1' }), 'echo');
  });

  test('settles a one-shot schedule only after its linked run succeeds', async () => {
    getRunningScheduleRuns.mockResolvedValueOnce([{
      id: 'schedule-1', run_status: 'succeeded', repeat_enabled: false,
    }]);

    await reconcileCoreScheduleRuns();

    expect(updateSchedule).toHaveBeenCalledWith('schedule-1', {
      status: 'completed', last_error: null,
    });
  });

  test('keeps linked run failures visible on the schedule', async () => {
    getRunningScheduleRuns.mockResolvedValueOnce([{
      id: 'schedule-1', run_status: 'failed', run_error: 'provider unavailable',
    }]);

    await reconcileCoreScheduleRuns();

    expect(updateSchedule).toHaveBeenCalledWith('schedule-1', {
      status: 'failed', last_error: 'provider unavailable',
    });
  });
});
