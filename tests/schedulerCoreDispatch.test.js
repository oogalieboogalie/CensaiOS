import { jest } from '@jest/globals';

const claimNextDueSchedule = jest.fn();
const getRunningScheduleRuns = jest.fn();
const updateSchedule = jest.fn();
const createAgentTask = jest.fn();
const getAllSubAgents = jest.fn();
const getAgents = jest.fn();
const enqueueCoreScheduleRun = jest.fn();

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
