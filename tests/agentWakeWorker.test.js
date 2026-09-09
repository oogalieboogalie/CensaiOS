import { jest } from '@jest/globals';

const claimAgentWakeup = jest.fn();
const requeueInProgressAgentWakeups = jest.fn();
const runAgentWakeup = jest.fn();
const runRestartSelfCheck = jest.fn();

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/agent-wakeups/store.js', () => ({
  claimAgentWakeup,
  requeueInProgressAgentWakeups,
}));
jest.unstable_mockModule('../server/agent-wakeups/execution.js', () => ({ runAgentWakeup }));
jest.unstable_mockModule('../server/agent-wakeups/restartSelfCheck.js', () => ({
  runRestartSelfCheck,
}));

const {
  getAgentWakeupWorkerStatus,
  pollAgentWakeups,
  startAgentWakeupWorker,
  stopAgentWakeupWorkerForTests,
} = await import('../server/agent-wakeups/worker.js');

describe('agent wakeup worker recovery and health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopAgentWakeupWorkerForTests();
    runRestartSelfCheck.mockResolvedValue({ ok: true });
  });

  afterAll(() => stopAgentWakeupWorkerForTests());

  test('recovers once before claiming and reports a clean worker state', async () => {
    requeueInProgressAgentWakeups.mockResolvedValueOnce({ completed: 1, failed: 0, requeued: 2 });
    claimAgentWakeup.mockResolvedValueOnce({ id: 'wake-1' });
    runAgentWakeup.mockResolvedValueOnce({ status: 'completed' });

    await pollAgentWakeups();
    await new Promise((resolve) => setImmediate(resolve));

    expect(requeueInProgressAgentWakeups).toHaveBeenCalledTimes(1);
    expect(claimAgentWakeup).toHaveBeenCalledTimes(1);
    expect(runAgentWakeup).toHaveBeenCalledWith({ id: 'wake-1' });
    expect(getAgentWakeupWorkerStatus()).toEqual(expect.objectContaining({
      recovered: true, activeCount: 0, lastPollError: null,
    }));
  });

  test('exposes running and ready after startup recovery', async () => {
    requeueInProgressAgentWakeups.mockResolvedValueOnce({ completed: 0, failed: 0, requeued: 0 });
    startAgentWakeupWorker();
    await new Promise((resolve) => setImmediate(resolve));

    expect(getAgentWakeupWorkerStatus()).toEqual(expect.objectContaining({
      ready: true, running: true, recovered: true,
    }));
  });

  test('stopping the worker cancels its delayed restart self-check', async () => {
    jest.useFakeTimers();
    try {
      requeueInProgressAgentWakeups.mockResolvedValueOnce({ completed: 0, failed: 0, requeued: 0 });
      claimAgentWakeup.mockResolvedValueOnce(null);
      await pollAgentWakeups();

      stopAgentWakeupWorkerForTests();
      jest.advanceTimersByTime(30_000);

      expect(runRestartSelfCheck).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
