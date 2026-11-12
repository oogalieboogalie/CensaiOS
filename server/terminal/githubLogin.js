import { resolveGithubToken } from '../github/mergeDesk.js';
import { userRole } from '../security/systemAdmin.js';

/**
 * Git in a terminal signs in to GitHub with the token the person already saved
 * in the canvas (GitHub window or Settings), so they don't log in a second
 * time. The computer's own GITHUB_TOKEN counts only for its owner, the same
 * rule the GitHub window uses (server/github/writeToken.js). Git asks this
 * helper only for https://github.com, so the token goes nowhere else.
 */
const HELPER = '!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$CENSAI_GITHUB_TOKEN"; }; f';

export async function githubGitEnv(userId, { resolve = resolveGithubToken, roleOf = userRole } = {}) {
  if (!userId) return {};
  const { token, source } = await resolve(userId).catch(() => ({ token: '' }));
  if (!token) return {};
  if (source === 'server' && await roleOf(Number(userId)).catch(() => null) !== 'admin') return {};
  return {
    CENSAI_GITHUB_TOKEN: token,
    // An empty helper first clears any helper the computer already has for
    // github.com (for example `gh auth setup-git`); otherwise that one answers
    // first and the saved token is never used.
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: HELPER,
  };
}
