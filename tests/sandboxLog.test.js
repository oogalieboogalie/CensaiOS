import { jest } from '@jest/globals';

// The sandbox's log says what ran and how it went: the sandbox's name (a
// hash), the command's length, its exit code and time. Never the project's
// folder, the folder inside it or the command's words. Docker is made up.
const FOLDER = '/made-up-home/pat-example/made-up-project';
const COMMAND = 'cat made-up-plans/made-up-budget.md && echo made-up birthday surprise';
const NAMED = ['pat-example', 'made-up-project', 'made-up-plans', 'made-up-budget', 'birthday'];
const exec = jest.fn();

jest.unstable_mockModule('../server/runner/client.js', () => ({ runnerClient: { exec } }));
jest.unstable_mockModule('../server/sandbox/images.js', () => ({ ensureSandboxImage: async () => {}, SANDBOX_IMAGE: 'made-up-image' }));

const { execInSandbox } = await import('../server/sandbox/execution.js');
const { onLogRecord } = await import('../server/logger.js');

let container;
let answer;
exec.mockImplementation(async (_program, args) => {
  if (args[0] === 'info') return { code: 0, stdout: 'made-up 27.0', stderr: '' };
  if (args[0] === 'inspect') return container === 'absent' ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: String(container === 'running'), stderr: '' };
  if (args[0] === 'run' || args[0] === 'start') { container = 'running'; return { code: 0, stdout: '', stderr: '' }; }
  if (args[0] === 'exec') { if (answer instanceof Error) throw answer; return answer; }
  throw new Error('made-up docker cannot do that');
});

let records;
let stop;
beforeEach(() => {
  records = [];
  stop = onLogRecord((record) => { if (record.namespace.startsWith('sandbox-')) records.push(record); });
});
afterEach(() => stop());

const said = () => records.map((record) => record.message);
const naming = () => records.map((record) => `${record.message} ${JSON.stringify(record.meta ?? {})}`)
  .filter((line) => NAMED.some((name) => line.includes(name)));
const run = () => execInSandbox(FOLDER, COMMAND, { cwd: 'made-up-plans' });

test('a new sandbox and a command that works are logged by name, length and outcome only', async () => {
  container = 'absent';
  answer = { code: 0, stdout: 'made-up budget', stderr: '' };
  expect((await run()).code).toBe(0);
  container = 'running';
  await run();
  expect(said()).toEqual(['creating sandbox container', 'exec', 'exec ok', 'reusing running sandbox', 'exec', 'exec ok']);
  const ok = records.find((record) => record.message === 'exec ok').meta;
  expect(ok).toEqual({ name: expect.stringMatching(/^homebase-sbx-[0-9a-f]{12}$/), chars: COMMAND.length, code: 0, ms: expect.any(Number) });
  expect(naming()).toEqual([]);
});

test('a stopped sandbox, a command that fails and one that runs too long name nothing either', async () => {
  container = 'stopped';
  answer = { code: 2, stdout: '', stderr: 'made-up-budget.md: no such file' };
  expect((await run()).code).toBe(2);
  answer = Object.assign(new Error('made-up birthday surprise ran too long'), { killed: true });
  await expect(run()).rejects.toMatchObject({ timedOut: true });
  answer = Object.assign(new Error('made-up-budget.md went away'), { code: 3, stderr: 'made-up-budget.md went away' });
  expect((await run()).code).toBe(3);
  expect(said()).toEqual(['starting stopped sandbox', 'exec', 'exec non-zero exit', 'reusing running sandbox', 'exec', 'exec timed out', 'reusing running sandbox', 'exec', 'exec non-zero exit']);
  expect(naming()).toEqual([]);
});
