import { jest } from '@jest/globals';

// One GitHub key path for everything done for a person (server/github/credential.js):
// the key that person saved in the app first, then this computer's GITHUB_TOKEN.
// Before this, the GitHub window used the saved key while an agent's file tools
// only looked at GITHUB_TOKEN, so someone who connected GitHub in the window saw
// their private repo there and their agent answered "GITHUB_TOKEN not configured".
//
// The real executeTool and file tools run here. GitHub and the people are made
// up: Pat Example owns this computer, Sam Example and Kim Example are teammates.
// Pat and Sam each saved their own GitHub key; Kim saved none.
const [PAT, SAM, KIM] = [1, 2, 3];
const ROLES = { [PAT]: 'admin', [SAM]: 'user', [KIM]: 'user' };
const SAVED = { [PAT]: 'made-up-key-of-pat', [SAM]: 'made-up-key-of-sam' };
const COMPUTER = 'made-up-key-of-this-computer';
// Two private repos the board gave the agent. Each key sees some of them, and may change some.
const REPO = 'acme/shop';
const OWNERS_REPO = 'acme/owners-only';
const BOARD = 'made-up-board';
const SEES = {
  [SAVED[PAT]]: [REPO, OWNERS_REPO],
  [SAVED[SAM]]: [REPO],
  [COMPUTER]: [REPO, OWNERS_REPO],
};
// Pat's saved key is a narrow one: it reads, and changes nothing. This computer's key may change things.
const CHANGES = { [COMPUTER]: [REPO, OWNERS_REPO] };
const PROJECT = { id: 'made-up-project', name: 'shop', repo: REPO, path: null, owner_agent_id: 'shared' };
const AGENT = 'made-up-reader';
const README = 'Made-up readme of a private repo.';

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const getUserApiKeyConfig = jest.fn(async (userId, provider) => (
  provider === 'github' && SAVED[userId] ? { apiKey: SAVED[userId], modelName: null } : null
));
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig,
  inferUserApiKeyProvider: () => null,
  normalizeUserApiKeyProvider: (value) => value,
  subscriptionTokenProblem: () => null,
  USER_API_KEY_PROVIDERS: Object.freeze(['github']),
}));

const priorToken = process.env.GITHUB_TOKEN;
const priorMode = process.env.CENSAI_MODE;
delete process.env.GITHUB_TOKEN;

const { executeTool } = await import('../server/tools.js');
const {
  CONNECT_GITHUB_MESSAGE, resolveGithubToken, resolveGithubCredential, runAsGithubPerson, sendWithGithubKey,
} = await import('../server/github/credential.js');
const mergeDesk = await import('../server/github/mergeDesk.js');
const { GITHUB_OFF_BOARD } = await import('../server/tools/rbac/ownerOnlyReads.js');

// The made-up GitHub. A repo a key cannot see is "Not Found", as on GitHub; a change a key may not make is 403.
const sentKeys = [];
function fakeGithub(url, options = {}) {
  const key = String(options.headers?.Authorization || '').replace(/^(Bearer|token) /, '');
  const method = (options.method || 'GET').toUpperCase();
  sentKeys.push(key);
  const repo = String(url).match(/\/repos\/([^/]+\/[^/?]+)/)?.[1];
  const answer = (status, json) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
  if (!(SEES[key] || []).includes(repo)) return answer(404, { message: 'Not Found' });
  if (method !== 'GET') {
    return (CHANGES[key] || []).includes(repo)
      ? answer(201, { number: 8, html_url: 'https://made-up.example/issues/8' })
      : answer(403, { message: 'Resource not accessible by personal access token' });
  }
  if (String(url).endsWith('/contents/README.md')) return answer(200, { type: 'file', path: 'README.md', content: Buffer.from(README).toString('base64') });
  return answer(200, [{ name: 'README.md', type: 'file', path: 'README.md' }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  sentKeys.length = 0;
  delete process.env.GITHUB_TOKEN;
  process.env.CENSAI_MODE = 'local_desktop';
  global.fetch = jest.fn(async (url, options) => fakeGithub(url, options));
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('JOIN projects')) return { rows: params[0] === BOARD && [REPO, OWNERS_REPO].includes(params[2]) ? [{ project_id: PROJECT.id }] : [] };
    if (text.includes('FROM workspace_agent_projects')) return { rows: [{ permission: 'read' }] };
    if (text.includes('FROM projects')) return { rows: params[0] === PROJECT.id ? [PROJECT] : [] };
    return { rows: [] };
  });
});

afterAll(() => {
  delete global.fetch;
  if (priorToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = priorToken;
  if (priorMode === undefined) delete process.env.CENSAI_MODE; else process.env.CENSAI_MODE = priorMode;
});

const readProjectFile = (context) => executeTool(AGENT, 'project_read', { project: PROJECT.id, path: 'README.md' }, context);
const listProjectFiles = (context) => executeTool(AGENT, 'project_list', { project: PROJECT.id, path: '/' }, context);
const readRepoFile = (context, repo = REPO) => executeTool(AGENT, 'github_read_file', { repo, path: 'README.md' }, context);
const openIssue = (context) => executeTool(AGENT, 'github_create_issue', { repo: REPO, title: 'Made-up issue', body: 'Made-up words' }, context);

describe('an agent reads a private repo with the key its person saved, with no GITHUB_TOKEN', () => {
  test("the owner's agent reads a project file and lists the project", async () => {
    expect(await readProjectFile({ userId: PAT })).toBe(README);
    expect(await listProjectFiles({ userId: PAT })).toBe('[FILE] README.md');
    expect(sentKeys).toEqual([SAVED[PAT], SAVED[PAT]]);
  });

  test("a teammate's agent reads the repo the board gave it, with the teammate's own key", async () => {
    expect(await readRepoFile({ userId: SAM, workspaceId: BOARD })).toBe(README);
    expect(sentKeys).toEqual([SAVED[SAM]]);
  });
});

describe("one person's saved key is never sent for another person", () => {
  test('two people working at the same moment each send their own key', async () => {
    const [forPat, forSam] = await Promise.all([
      readProjectFile({ userId: PAT }),
      readRepoFile({ userId: SAM, workspaceId: BOARD }),
    ]);
    expect([forPat, forSam]).toEqual([README, README]);
    expect([...sentKeys].sort()).toEqual([SAVED[PAT], SAVED[SAM]].sort());
    expect(getUserApiKeyConfig.mock.calls.map(([userId]) => userId).sort()).toEqual([PAT, SAM]);
  });

  test("Kim, who saved no key, gets neither Pat's nor Sam's: her agent is told to connect GitHub", async () => {
    const result = await readRepoFile({ userId: KIM, workspaceId: BOARD });
    expect(result).toBe(`Error: ${CONNECT_GITHUB_MESSAGE}`);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sentKeys).toEqual([]);
  });

  test("a repo Sam's key cannot see is not read with Pat's saved key, which can", async () => {
    // No GITHUB_TOKEN here: the only key that could read it is another person's.
    expect(await readRepoFile({ userId: SAM, workspaceId: BOARD }, OWNERS_REPO)).toMatch(/^Error: GitHub API error 404/);
    expect(sentKeys).toEqual([SAVED[SAM]]);
  });

  test('a call made for nobody uses no saved key, even inside work done for someone else', async () => {
    expect(await resolveGithubCredential()).toEqual({ token: '', source: null });
    await runAsGithubPerson({ userId: PAT }, async () => {
      expect((await resolveGithubCredential()).token).toBe(SAVED[PAT]);
      expect((await resolveGithubCredential({ userId: SAM })).token).toBe(SAVED[SAM]);
      expect(await resolveGithubCredential({ userId: KIM })).toEqual({ token: '', source: null });
      expect(await resolveGithubCredential({ userId: null })).toEqual({ token: '', source: null });
    });
    expect(await resolveGithubCredential()).toEqual({ token: '', source: null });
  });
});

describe('with neither a saved key nor GITHUB_TOKEN', () => {
  test('the message names the connect step in the GitHub window, not only the .env file', async () => {
    const result = await readRepoFile({ userId: KIM, workspaceId: BOARD });
    expect(result).toContain('Open the GitHub window');
    expect(result).toContain('connect step');
    expect(result).not.toContain('GITHUB_TOKEN not configured');
  });
});

describe('one order, one function', () => {
  test('the saved key comes first and GITHUB_TOKEN is the fallback, for the window and the agent alike', async () => {
    process.env.GITHUB_TOKEN = COMPUTER;
    // The GitHub window's routes ask the very same function.
    expect(mergeDesk.resolveGithubToken).toBe(resolveGithubToken);
    expect(await resolveGithubToken(SAM)).toEqual({ token: SAVED[SAM], source: 'byok' });
    expect(await resolveGithubToken(KIM)).toEqual({ token: COMPUTER, source: 'server' });
    // Kim saved nothing: her agent reads the board's repo with this computer's key, as it always did.
    expect(await readRepoFile({ userId: KIM, workspaceId: BOARD })).toBe(README);
    expect(sentKeys).toEqual([COMPUTER]);
  });

  test('when the saved keys cannot be read, this computer\'s key is used and nothing is thrown', async () => {
    process.env.GITHUB_TOKEN = COMPUTER;
    getUserApiKeyConfig.mockRejectedValueOnce(new Error('made-up outage'));
    expect(await resolveGithubToken(SAM)).toEqual({ token: COMPUTER, source: 'server' });
  });
});

// What worked with this computer's key before a person saved a key of their own still works.
describe("a saved key that cannot do it does not take away what this computer's key could", () => {
  beforeEach(() => { process.env.GITHUB_TOKEN = COMPUTER; });

  test("a teammate whose own key cannot see a repo the board shared still reads it, with this computer's key", async () => {
    expect(await readRepoFile({ userId: SAM, workspaceId: BOARD }, OWNERS_REPO)).toBe(README);
    // Sam's own key first, then this computer's, once. Never Pat's.
    expect(sentKeys).toEqual([SAVED[SAM], COMPUTER]);
  });

  test("an owner who saved a narrower key keeps the changes this computer's key can make", async () => {
    expect(await openIssue({ userId: PAT, workspaceId: BOARD })).toBe('Created issue #8: https://made-up.example/issues/8');
    expect(sentKeys).toEqual([SAVED[PAT], COMPUTER]);
  });

  test('a saved key that can do it is the only key sent', async () => {
    expect(await readRepoFile({ userId: SAM, workspaceId: BOARD })).toBe(README);
    expect(sentKeys).toEqual([SAVED[SAM]]);
  });

  test("the board's and the owner's rules still come first: a refused call reaches GitHub with no key at all", async () => {
    // A repo the board did not give Sam's agent, and a change only the owner may ask for.
    expect(await readRepoFile({ userId: SAM, workspaceId: BOARD }, 'acme/not-on-the-board')).toMatch(/^Error: PROJECT_ACCESS_DENIED: /);
    expect(await openIssue({ userId: SAM, workspaceId: BOARD })).toMatch(/^Error: COMPUTER_OWNER_ONLY: /);
    expect(sentKeys).toEqual([]);
  });

  test("this computer's key only stands in where the work was told it may, once, and only for 401, 403 or 404", async () => {
    const send = (status) => jest.fn(async () => ({ status }));
    // Work that was not told so (no rules ran in front of it): the saved key's answer stands.
    const plain = send(404);
    expect(await runAsGithubPerson({ userId: SAM }, () => sendWithGithubKey(plain))).toMatchObject({ source: 'byok' });
    expect(plain.mock.calls).toEqual([[SAVED[SAM]]]);
    // Told so: one more try, with this computer's key.
    for (const status of [401, 403, 404]) {
      const allowed = send(status);
      expect(await runAsGithubPerson({ userId: SAM, computerKey: true }, () => sendWithGithubKey(allowed))).toMatchObject({ source: 'server' });
      expect(allowed.mock.calls).toEqual([[SAVED[SAM]], [COMPUTER]]);
    }
    // Any other answer (GitHub down, a bad request) is not a reason to switch keys.
    const down = send(500);
    await runAsGithubPerson({ userId: SAM, computerKey: true }, () => sendWithGithubKey(down));
    expect(down.mock.calls).toEqual([[SAVED[SAM]]]);
  });
});

describe('off a board, the refusal says what is true', () => {
  test('a teammate who saved a key of their own is not told the rule is about the computer\'s key', async () => {
    process.env.GITHUB_TOKEN = COMPUTER;
    const result = await readRepoFile({ userId: SAM });
    expect(result).toBe(`Error: ${GITHUB_OFF_BOARD}`);
    expect(result).toContain('whichever GitHub key is saved');
    expect(result).not.toContain('with its key');
    expect(sentKeys).toEqual([]);
  });
});
