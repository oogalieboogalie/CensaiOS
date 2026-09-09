/* eslint-env jest */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Mock child_process so it doesn't actually launch powershell/cmd
const spawnMock = jest.fn(() => ({ unref: () => {} }));
jest.unstable_mockModule('child_process', () => ({
  spawn: spawnMock
}));

const { scheduleLocalDevRestart } = await import('../server/local-dev-restarts/scheduler.js');

describe('local dev restart process exclusion', () => {
  const restartId = 'test-restart-exclude-pid-id';
  const runnerFile = path.join(process.cwd(), '.homebase-state', 'restart-runners', `${restartId}.ps1`);

  beforeEach(() => {
    jest.clearAllMocks();
    if (fs.existsSync(runnerFile)) {
      fs.unlinkSync(runnerFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(runnerFile)) {
      fs.unlinkSync(runnerFile);
    }
  });

  test('generates PowerShell script with ProcessId exclusion when LOCAL_DEV_RESTART_EXCLUDE_PID is set', () => {
    // Set mock exclude PID
    process.env.LOCAL_DEV_RESTART_EXCLUDE_PID = '123456';

    scheduleLocalDevRestart({
      id: restartId,
      cwd: process.cwd(),
      noticeSeconds: 5,
      port: 3001
    });

    expect(fs.existsSync(runnerFile)).toBe(true);
    const content = fs.readFileSync(runnerFile, 'utf8');

    // Verify script contains process ID exclusion filter
    expect(content).toContain('($_.ProcessId -ne 123456)');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  test('generates PowerShell script with 0 exclusion when LOCAL_DEV_RESTART_EXCLUDE_PID is not set', () => {
    delete process.env.LOCAL_DEV_RESTART_EXCLUDE_PID;

    scheduleLocalDevRestart({
      id: restartId,
      cwd: process.cwd(),
      noticeSeconds: 5,
      port: 3001
    });

    expect(fs.existsSync(runnerFile)).toBe(true);
    const content = fs.readFileSync(runnerFile, 'utf8');

    expect(content).toContain('($_.ProcessId -ne 0)');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
