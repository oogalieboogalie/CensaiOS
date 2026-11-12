import { execFileSync } from 'child_process';
import { githubGitEnv } from '../server/terminal/githubLogin.js';

const own = { resolve: async () => ({ token: 'ghp_own_saved_token', source: 'byok' }), roleOf: async () => 'member' };
const server = (role) => ({ resolve: async () => ({ token: 'ghp_computer_token', source: 'server' }), roleOf: async () => role });

function fill(env, host) {
  try {
    return execFileSync('git', ['credential', 'fill'], {
      input: `protocol=https\nhost=${host}\n\n`,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: '0', ...env },
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString();
  } catch {
    return '';
  }
}

describe('terminal GitHub login', () => {
  test('git uses the token the person saved in the canvas, for github.com only', async () => {
    const env = await githubGitEnv(7, own);
    expect(fill(env, 'github.com')).toContain('password=ghp_own_saved_token');
    expect(fill(env, 'gitlab.com')).not.toContain('ghp_own_saved_token');
  });

  test("the computer's own token goes only to its owner", async () => {
    expect(await githubGitEnv(7, server('member'))).toEqual({});
    expect((await githubGitEnv(1, server('admin'))).CENSAI_GITHUB_TOKEN).toBe('ghp_computer_token');
  });

  test('no person or no saved token means no login', async () => {
    expect(await githubGitEnv(null, own)).toEqual({});
    expect(await githubGitEnv(7, { resolve: async () => ({ token: '', source: null }) })).toEqual({});
  });
});
