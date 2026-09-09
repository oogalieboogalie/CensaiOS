import { jest } from '@jest/globals';

const claimNextAgentCardRun = jest.fn();
const recoverInProgressAgentCardRuns = jest.fn();
const executeAgentCardRun = jest.fn();

jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/agent-card-runs/store.js', () => ({
  claimNextAgentCardRun,
  recoverInProgressAgentCardRuns,
}));
jest.unstable_mockModule('../server/agent-card-runs/execution.js', () => ({ executeAgentCardRun }));

const { pollAgentCardRuns } = await import('../server/agent-card-runs/worker.js');

describe('AgentCard run worker', () => {
  beforeEach(() => jest.clearAllMocks());

  test('recovers interrupted work once, claims one run, and executes it', async () => {
    recoverInProgressAgentCardRuns.mockResolvedValueOnce({ requeued: 2, externalFailed: 0 });
    claimNextAgentCardRun.mockResolvedValueOnce({ id: 'run-1', status: 'running' });
    executeAgentCardRun.mockResolvedValueOnce({ status: 'succeeded' });

    await expect(pollAgentCardRuns()).resolves.toBe('run-1');
    await new Promise((resolve) => setImmediate(resolve));
    expect(recoverInProgressAgentCardRuns).toHaveBeenCalledTimes(1);
    expect(claimNextAgentCardRun).toHaveBeenCalledTimes(1);
    expect(executeAgentCardRun).toHaveBeenCalledWith({ id: 'run-1', status: 'running' });
  });
});
