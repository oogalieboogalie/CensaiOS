// run_tests and run_linter read the runner's exit code: the runner returns
// { stdout, stderr, code } instead of throwing, so a failing test run used to
// come back as "TEST RUN — SUCCESS".
import { jest } from '@jest/globals';

const runCommand = jest.fn();
const real = await import('../server/tools/handlers/runnerUtils.js');
jest.unstable_mockModule('../server/tools/handlers/runnerUtils.js', () => ({
  ...real,
  runCommand,
  readPackageJson: async () => ({ scripts: { test: 'jest', lint: 'eslint .' } }),
  resolveLocalBin: async () => null,
  resolveRunnerContext: async () => ({ cwd: '/work/app', scopedPath: '.' }),
  resolveLinterContext: async () => ({ cwd: '/work/app', scopedPath: '.' }),
}));
const { handleRunnerTool } = await import('../server/tools/handlers/runner.js');

beforeEach(() => runCommand.mockReset());

test('a failing exit code is reported as failed, a clean one as success', async () => {
  runCommand.mockResolvedValueOnce({ stdout: 'Tests: 1 failed, 2 total', stderr: '', code: 1 });
  expect(await handleRunnerTool('nexus', 'run_tests', {})).toMatch(/^TEST RUN — FAILED \(exit 1\)\nExit code: 1/);
  runCommand.mockResolvedValueOnce({ stdout: 'Tests: 2 passed, 2 total', stderr: '', code: 0 });
  expect(await handleRunnerTool('nexus', 'run_tests', {})).toMatch(/^TEST RUN — SUCCESS\nExit code: 0/);
});

test('lint issues are found from the exit code too, and a thrown failure still counts', async () => {
  runCommand.mockResolvedValueOnce({ stdout: '3 problems', stderr: '', code: 1 });
  expect(await handleRunnerTool('nexus', 'run_linter', {})).toMatch(/^LINT — ISSUES FOUND \(exit 1\)/);
  runCommand.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 2, stdout: '', stderr: 'crash' }));
  expect(await handleRunnerTool('nexus', 'run_tests', {})).toMatch(/^TEST RUN — FAILED \(exit 2\)/);
  runCommand.mockRejectedValueOnce(Object.assign(new Error('slow'), { code: 'ETIMEDOUT' }));
  expect(await handleRunnerTool('nexus', 'run_tests', { timeout_ms: 5 })).toBe('run_tests timed out after 5ms.');
});
