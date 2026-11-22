import { jest } from '@jest/globals';

// Before work starts on a project kept on GitHub, one check says what the key
// the work will really use can do there: read at the chosen branch or commit,
// make a branch, open a pull request. Each is answered on its own, so a fix
// that needs a branch and a pull request hears up front that it can only read.
// What GitHub does not tell in advance is answered "unknown", never guessed.
//
// GitHub and the people are made up. Sam Example saved a key; Kim Example did not.
const [SAM, KIM] = [2, 3];
const SAVED = { [SAM]: 'made-up-key-of-sam' };
const COMPUTER = 'made-up-key-of-this-computer';
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(async () => ({ rows: [] })), on: jest.fn() } }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async (userId, provider) => (provider === 'github' && SAVED[userId] ? { apiKey: SAVED[userId] } : null)),
  inferUserApiKeyProvider: () => null,
  normalizeUserApiKeyProvider: (value) => value,
  subscriptionTokenProblem: () => null,
  USER_API_KEY_PROVIDERS: Object.freeze(['github']),
}));

const priorToken = process.env.GITHUB_TOKEN;
delete process.env.GITHUB_TOKEN;
const { checkGithubAccess } = await import('../server/github/access.js');
const { CONNECT_GITHUB_MESSAGE, runAsGithubPerson } = await import('../server/github/credential.js');

const SHA = '0123456789abcdef0123456789abcdef01234567';
// What the made-up GitHub knows about each repo; `refs` are the branches and commits it has,
// `only` the one key that can see it (none: every key).
const REPOS = {
  'acme/shop': { default_branch: 'main', private: true, permissions: { pull: true, push: true }, refs: ['main', 'fix/cart', SHA] },
  'acme/read-only': { default_branch: 'main', private: true, permissions: { pull: true, push: false }, refs: ['main'] },
  'acme/no-prs': { default_branch: 'main', private: true, permissions: { pull: true, push: true }, has_pull_requests: false, refs: ['main'] },
  'acme/archived': { default_branch: 'main', private: false, archived: true, permissions: { pull: true, push: true }, refs: ['main'] },
  'acme/empty': { default_branch: 'main', private: true, permissions: { pull: true, push: true }, refs: [] },
  'acme/computer-only': { default_branch: 'main', private: true, permissions: { pull: true, push: true }, refs: ['main'], only: COMPUTER },
};
const calls = [];
// A classic key lists what it may do in a header ('repo'); a fine-grained key sends none (null).
let scopes = 'repo';
let refuse = null;
function fakeGithub(url, options = {}) {
  const where = String(url).replace('https://api.github.com', '');
  const key = String(options.headers?.Authorization || '').replace('Bearer ', '');
  calls.push({ method: options.method || 'GET', where, key });
  const answer = (code, body, headers = {}) => ({
    ok: code < 300, status: code, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: (name) => (name === 'x-oauth-scopes' ? scopes : headers[name] ?? null) },
  });
  if (refuse) return answer(refuse.status, { message: refuse.message || 'made-up refusal' }, refuse.headers);
  const [, name, rest] = where.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/) || [];
  const repo = REPOS[name];
  if (!repo || (repo.only && repo.only !== key)) return answer(404, { message: 'Not Found' });
  if (!rest) return answer(200, repo);
  if (!repo.refs.length) return answer(409, { message: 'Git Repository is empty.' });
  const ref = decodeURIComponent(rest.replace('/commits/', ''));
  return repo.refs.includes(ref) ? answer(200, SHA) : answer(422, { message: 'No commit found for SHA' });
}

beforeEach(() => {
  calls.length = 0;
  scopes = 'repo';
  refuse = null;
  delete process.env.GITHUB_TOKEN;
  global.fetch = jest.fn(async (url, options) => fakeGithub(url, options));
});
afterAll(() => {
  delete global.fetch;
  if (priorToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = priorToken;
});

const ALL = ['read', 'branch', 'pull request'];

describe('read, branch and pull request are answered separately', () => {
  test('a key with write access can do all three, at a branch or at a commit', async () => {
    for (const ref of ['fix/cart', SHA]) {
      const access = await checkGithubAccess({ repo: 'acme/shop', ref, userId: SAM, needs: ALL });
      expect(access).toMatchObject({ ok: true, reason: '', canRead: true, canBranch: true, canOpenPullRequest: true, missing: [], unknown: [], sha: SHA, ref, credential: 'byok' });
    }
  });

  test('read access only: no branch, and so no pull request either (the app opens one from a branch in the repo)', async () => {
    const reading = await checkGithubAccess({ repo: 'acme/read-only', userId: SAM });
    expect(reading).toMatchObject({ ok: true, canRead: true, canBranch: false, canOpenPullRequest: false, missing: ['branch', 'pull request'], ref: 'main' });

    const fixing = await checkGithubAccess({ repo: 'acme/read-only', userId: SAM, needs: ALL });
    expect(fixing).toMatchObject({ ok: false, canRead: true, canBranch: false, canOpenPullRequest: false });
    expect(fixing.reason).toBe('In acme/read-only, the saved GitHub sign-in can read, but cannot make a branch or open a pull request: '
      + 'this GitHub account has read access only. Ask the repo owner for write access, or connect a key that has it.');
  });

  test('a repo with pull requests turned off: a branch yes, a pull request no', async () => {
    const access = await checkGithubAccess({ repo: 'acme/no-prs', userId: SAM, needs: ALL });
    expect(access).toMatchObject({ ok: false, canRead: true, canBranch: true, canOpenPullRequest: false, missing: ['pull request'] });
    expect(access.reason).toContain('can read and make a branch, but cannot open a pull request: pull requests are turned off for this repo.');
    // A job that only needs the branch is fine there.
    expect(await checkGithubAccess({ repo: 'acme/no-prs', userId: SAM, needs: ['read', 'branch'] })).toMatchObject({ ok: true, reason: '' });
  });

  test('a read-only classic key and an archived repo can read and nothing more', async () => {
    scopes = 'read:org, read:user';
    expect(await checkGithubAccess({ repo: 'acme/shop', userId: SAM, needs: ALL }))
      .toMatchObject({ ok: false, canRead: true, canBranch: false, canOpenPullRequest: false, missing: ['branch', 'pull request'], reason: expect.stringContaining('the key is read-only') });
    scopes = 'repo';
    expect(await checkGithubAccess({ repo: 'acme/archived', userId: SAM, needs: ALL }))
      .toMatchObject({ ok: false, canRead: true, canBranch: false, canOpenPullRequest: false, reason: expect.stringContaining('the repo is archived') });
  });
});

describe('what cannot be known up front is not reported as yes', () => {
  beforeEach(() => { scopes = null; }); // a fine-grained key: GitHub does not say what it may do

  test('a fine-grained key on a repo the account may write to: read is yes, branch and pull request are unknown', async () => {
    const access = await checkGithubAccess({ repo: 'acme/shop', userId: SAM, needs: ALL });
    expect(access).toMatchObject({ ok: 'unknown', canRead: true, canBranch: 'unknown', canOpenPullRequest: 'unknown', missing: [], unknown: ['branch', 'pull request'] });
    expect(access.reason).toBe('In acme/shop, the saved GitHub sign-in can read. Whether it can make a branch or open a pull request is not known yet: '
      + 'this kind of key does not say what it may do until it tries.');
  });

  test('reading alone is still a plain yes, and what is known to be missing is still a plain no', async () => {
    expect(await checkGithubAccess({ repo: 'acme/shop', userId: SAM })).toMatchObject({ ok: true, reason: '', unknown: ['branch', 'pull request'] });
    expect(await checkGithubAccess({ repo: 'acme/read-only', userId: SAM, needs: ALL })).toMatchObject({ ok: false, canBranch: false, canOpenPullRequest: false, unknown: [] });
    expect(await checkGithubAccess({ repo: 'acme/no-prs', userId: SAM, needs: ALL }))
      .toMatchObject({ ok: false, canBranch: 'unknown', canOpenPullRequest: false, missing: ['pull request'], unknown: ['branch'], reason: expect.stringContaining('pull requests are turned off') });
  });
});

describe('a word in `needs` it does not know is an error, not a silent yes', () => {
  test('a misspelt need throws and GitHub is never asked', async () => {
    await expect(checkGithubAccess({ repo: 'acme/read-only', userId: SAM, needs: ['read', 'pull_request'] }))
      .rejects.toThrow('unknown need "pull_request". Ask for "read", "branch" or "pull request".');
    await expect(checkGithubAccess({ repo: 'acme/read-only', userId: SAM, needs: 'push' })).rejects.toThrow(TypeError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('when it cannot read, the reason is plain', () => {
  test('a branch or commit that is not there', async () => {
    const access = await checkGithubAccess({ repo: 'acme/shop', ref: 'x', userId: SAM });
    expect(access).toMatchObject({ ok: false, canRead: false, canBranch: false, canOpenPullRequest: false, missing: ALL });
    expect(access.reason).toBe('Cannot read acme/shop at branch or commit "x" with the saved GitHub sign-in: no such branch or commit, or no access.');
  });

  test('a repo that is not there, or that the key may not see', async () => {
    const access = await checkGithubAccess({ repo: 'acme/secret', ref: 'main', userId: SAM });
    expect(access).toMatchObject({ ok: false, canRead: false });
    expect(access.reason).toBe('Cannot read acme/secret with the saved GitHub sign-in: not found or no access.');
  });

  test('a repo with nothing in it yet says so, instead of "no such branch"', async () => {
    const access = await checkGithubAccess({ repo: 'acme/empty', userId: SAM, needs: ALL });
    expect(access).toMatchObject({ ok: false, canRead: false });
    expect(access.reason).toBe('Cannot read acme/empty with the saved GitHub sign-in: the repo has nothing in it yet.');
  });

  test('GitHub asking the key to slow down says so, instead of "not found or no access"', async () => {
    refuse = { status: 403, message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' };
    const told = await checkGithubAccess({ repo: 'acme/shop', userId: SAM });
    expect(told.reason).toContain('GitHub is asking this key to slow down');
    expect(told.reason).not.toContain('not found or no access');
    refuse = { status: 403, headers: { 'retry-after': '60' } };
    expect((await checkGithubAccess({ repo: 'acme/shop', userId: SAM })).reason).toContain('GitHub is asking this key to slow down');
    // The hourly limit has its own words, and a plain 403 is still "no access".
    refuse = { status: 403, headers: { 'x-ratelimit-remaining': '0' } };
    expect((await checkGithubAccess({ repo: 'acme/shop', userId: SAM })).reason).toContain('GitHub is limiting requests right now');
    refuse = { status: 403 };
    expect((await checkGithubAccess({ repo: 'acme/shop', userId: SAM })).reason).toContain('not found or no access');
  });

  test('a key GitHub no longer accepts, GitHub being unreachable, and a repo name that is not one', async () => {
    refuse = { status: 401 };
    expect((await checkGithubAccess({ repo: 'acme/shop', userId: SAM })).reason).toContain('GitHub did not accept the saved GitHub sign-in');
    refuse = null;
    global.fetch = jest.fn(async () => { throw new Error('made-up network failure'); });
    expect((await checkGithubAccess({ repo: 'acme/shop', userId: SAM })).reason).toContain('could not reach GitHub');
    expect(await checkGithubAccess({ repo: '../shop', userId: SAM })).toMatchObject({ ok: false, reason: 'The repo must be written as owner/name.' });
  });

  test('with no key at all, it names the connect step and GitHub is never asked', async () => {
    const access = await checkGithubAccess({ repo: 'acme/shop', userId: KIM, needs: ALL });
    expect(access).toMatchObject({ ok: false, credential: null, reason: CONNECT_GITHUB_MESSAGE });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('it uses the key the work will really use, and only reads', () => {
  test("inside work done for Sam it sends Sam's key; this computer's key is the fallback and is named", async () => {
    await runAsGithubPerson({ userId: SAM }, () => checkGithubAccess({ repo: 'acme/shop' }));
    process.env.GITHUB_TOKEN = COMPUTER;
    const forKim = await checkGithubAccess({ repo: 'acme/secret', userId: KIM });
    expect(forKim.credential).toBe('server');
    expect(forKim.reason).toBe("Cannot read acme/secret with this computer's GitHub key (GITHUB_TOKEN): not found or no access.");
    expect(calls.map((call) => call.key)).toEqual([SAVED[SAM], SAVED[SAM], COMPUTER]);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  test("where the work may use this computer's key, the check answers for the key that will end up being used", async () => {
    process.env.GITHUB_TOKEN = COMPUTER;
    // Not told so: Sam's own key cannot see the repo, and that is the answer.
    expect(await checkGithubAccess({ repo: 'acme/computer-only', userId: SAM })).toMatchObject({ ok: false, credential: 'byok' });
    expect(calls.map((call) => call.key)).toEqual([SAVED[SAM]]);
    calls.length = 0;
    // Told so (as a tool call is, after the board's rules): this computer's key reads it, for both reads.
    const allowed = await runAsGithubPerson({ userId: SAM, computerKey: true }, () => checkGithubAccess({ repo: 'acme/computer-only', needs: ALL }));
    expect(allowed).toMatchObject({ ok: true, credential: 'server', canRead: true, sha: SHA });
    expect(calls.map((call) => call.key)).toEqual([SAVED[SAM], COMPUTER, COMPUTER]);
    expect(await checkGithubAccess({ repo: 'acme/computer-only', userId: SAM, computerKey: true })).toMatchObject({ ok: true, credential: 'server' });
  });
});
