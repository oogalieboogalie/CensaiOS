import { jest } from '@jest/globals';
import { consoleCalls, stubLogger, watchConsole } from './support/serverNotes.js';

const { lines, logger } = stubLogger();
jest.unstable_mockModule('../server/logger.js', () => logger);
const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true }));
jest.unstable_mockModule('../server/secrets.js', () => ({ getSecret: () => 'made-up-key' }));
const refreshSession = jest.fn();
jest.unstable_mockModule('../server/jules.js', () => ({ refreshSession }));
jest.unstable_mockModule('../server/jules-task-sync/index.js', () => ({
  fetchGitHubPullRequestFiles: jest.fn(), fetchGitHubPullRequestState: jest.fn(), syncAgentTaskFromJulesSession: jest.fn(),
}));
jest.unstable_mockModule('../server/workspaces.js', () => ({ getProject: jest.fn(), logProjectActivity: jest.fn() }));
const { tickJulesWatcher } = await import('../server/boot/julesWatcher.js');

test('a failed session refresh leaves one jules-watcher line with the row id only', async () => {
  const spies = watchConsole();
  query.mockResolvedValueOnce({ rows: [{ id: 'row-1', jules_session_name: 'sessions/made-up', title: 'Pat task', status: 'QUEUED' }] });
  refreshSession.mockRejectedValueOnce(Object.assign(new Error('made-up failure text'), { code: 'ETIMEDOUT' }));
  await tickJulesWatcher();
  expect(lines).toEqual([{ namespace: 'jules-watcher', level: 'warn', msg: 'jules session refresh failed', meta: { session: 'row-1', code: 'ETIMEDOUT' } }]);
  expect(JSON.stringify(lines)).not.toMatch(/Pat task|made-up failure text|sessions\/made-up/);
  expect(consoleCalls(spies)).toBe(0);
});
