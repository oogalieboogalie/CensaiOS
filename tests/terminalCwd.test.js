import os from 'os';
import { resolveTerminalCwd } from '../server/terminal/shared.js';

describe('where a terminal shell starts', () => {
  test('a folder this server can see is used as is', () => {
    expect(resolveTerminalCwd(os.tmpdir())).toEqual({ cwd: os.tmpdir(), unreachable: null });
  });

  test('no folder: the app folder, nothing to report', () => {
    expect(resolveTerminalCwd('')).toEqual({ cwd: process.cwd(), unreachable: null });
  });

  test('a Windows folder the container cannot reach falls back instead of killing the shell', () => {
    if (process.platform === 'win32') return;
    // The owner's PC: the terminal was mounted to D:\Repos, but only
    // D:\Repos\CensaiHub is shared with the app's container.
    expect(resolveTerminalCwd('D:\\Repos')).toEqual({ cwd: process.cwd(), unreachable: 'D:\\Repos' });
  });

  test('a folder that does not exist falls back too', () => {
    expect(resolveTerminalCwd('/no/such/folder/anywhere')).toEqual({ cwd: process.cwd(), unreachable: '/no/such/folder/anywhere' });
  });
});

describe('what a shell outside the sandbox gets', () => {
  test("the app's secrets stay out of the shell's environment", async () => {
    const { terminalEnv } = await import('../server/terminal/shared.js');
    const env = terminalEnv({
      PATH: '/usr/bin', HOME: '/root', SESSION_SECRET: 's', DATABASE_URL: 'postgres://x',
      ANTHROPIC_API_KEY: 'k', GITHUB_TOKEN: 't', RUNNER_SECRET: 'r', CENSAI_MODE: 'local_desktop',
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/root', CENSAI_MODE: 'local_desktop', TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  });

  test('it says plainly that it is not the sandbox, and what it can see', async () => {
    const { hostShellNote } = await import('../server/terminal/backends.js');
    expect(hostShellNote({ CENSAI_IN_CONTAINER: '1' })).toMatch(/Not the sandbox.*app container.*not the rest of your PC.*internet/);
    expect(hostShellNote({})).toMatch(/Not the sandbox/);
  });

  test('a teammate who is not owner or admin is not given a shell outside the sandbox', async () => {
    const { startBackend } = await import('../server/terminal/backends.js');
    await expect(startBackend(process.cwd(), false, { cols: 80, rows: 24 }, { role: 'member' }))
      .rejects.toThrow(/only the board's owner/);
  });
});
