import { jest } from '@jest/globals';

// On a Docker install every command an agent ran went to the runner, which only
// runs `docker` and has no project folders, so tests, git and shell commands were
// refused on the owner's own computer (diagram 13: "Refused by the Docker
// gatekeeper", "Not a git working tree"). The owner's call with Trust mode on now
// runs its commands here, in the app's own container (server/runner/hereForRun.js).
const { runWithHere, runsHere } = await import('../server/runner/hereForRun.js');
const { RunnerClient } = await import('../server/runner/client.js');

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; jest.restoreAllMocks(); });

describe('runsHere', () => {
  test('outside a tool call, commands go where they always went', async () => {
    expect(await runsHere()).toBe(false);
  });

  test('inside a call it follows the decision, made once and only when asked', async () => {
    const decide = jest.fn(async () => true);
    await runWithHere(decide, async () => {
      expect(decide).not.toHaveBeenCalled();
      expect(await runsHere()).toBe(true);
      expect(await runsHere()).toBe(true);
    });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(await runWithHere(async () => false, runsHere)).toBe(false);
  });

  test('a decision that fails keeps the runner', async () => {
    expect(await runWithHere(async () => { throw new Error('database is down'); }, runsHere)).toBe(false);
  });
});

describe('a Docker install, where commands go to a Docker-only runner', () => {
  function dockerInstall() {
    process.env.RUNNER_ENABLED = 'true';
    process.env.RUNNER_URL = 'http://runner.invalid:3003';
    process.env.RUNNER_SECRET = 'made-up-secret-made-up-secret-made-up';
    // The runner answers the way the real Docker gatekeeper does.
    return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ stdout: '', stderr: 'Refused by the Docker gatekeeper: only docker commands run here.', code: 126 }),
    });
  }
  const node = (client) => client.exec(process.execPath, ['-e', 'process.stdout.write("ran here")']);

  test('the owner\'s call with Trust mode on runs the command here', async () => {
    const fetch = dockerInstall();
    const result = await runWithHere(async () => true, () => node(new RunnerClient()));
    expect(result).toMatchObject({ code: 0, stdout: 'ran here' });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('a command run here gets none of the app\'s keys, as on the runner', async () => {
    dockerInstall();
    process.env.MADE_UP_API_KEY = 'made-up-key';
    process.env.DATABASE_URL = 'postgresql://made-up';
    process.env.MADE_UP_PLAIN = 'plain';
    const show = 'process.stdout.write([process.env.MADE_UP_API_KEY, process.env.DATABASE_URL, process.env.MADE_UP_PLAIN].join("|"))';
    const result = await runWithHere(async () => true, () => new RunnerClient().exec(process.execPath, ['-e', show]));
    expect(result.stdout).toBe('||plain');
  });

  test('docker itself still goes to the runner, the one that can reach Docker', async () => {
    const fetch = dockerInstall();
    await runWithHere(async () => true, () => new RunnerClient().exec('docker', ['info']));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('anyone else\'s call still goes to the runner, and is refused there as before', async () => {
    const fetch = dockerInstall();
    const result = await runWithHere(async () => false, () => node(new RunnerClient()));
    expect(result.stderr).toMatch(/Docker gatekeeper/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('http://runner.invalid:3003/exec');
  });
});
