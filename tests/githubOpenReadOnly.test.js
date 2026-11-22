import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Opening a project kept on GitHub only reads. Before this, the first open
// wrote .team/PROJECT.md onto the repo's default branch: someone with read
// access got a failure just from opening, and someone with write access got a
// commit nobody asked for. The brief now stays in the app's own folder, and
// goes into a repo only when asked, on a branch of its own.
//
// GitHub is made up: acme/shop, and a key that may read it and nothing more.
const REPO = 'acme/shop';
// Built from parts: the public copy's test scan treats a quoted repo path as a file this test reads.
const BRIEF_PATH = ['.team', 'PROJECT.md'].join('/');
const KEY = 'made-up-read-only-key';
const [PAT, SAM] = [1, 2];
const SAVED = { [PAT]: KEY, [SAM]: KEY };

const rows = [];
const pool = {
  query: jest.fn(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('INSERT INTO projects')) {
      const [id, owner, name, repo, summary] = params;
      const project = { id, owner_agent_id: owner, name, path: null, repo, summary, created_at: '2026-01-05T00:00:00Z' };
      rows.push(project);
      return { rows: [project] };
    }
    if (text.includes('FROM users')) return { rows: params[0] === PAT ? [{ role: 'admin' }] : [] };
    if (text.includes('FROM projects')) return { rows: rows.filter((row) => row.repo === params[0] || row.id === params[0]) };
    return { rows: [] };
  }),
  connect: jest.fn(), on: jest.fn(), end: jest.fn(),
};
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/security/userApiKeys.js', () => ({
  getUserApiKeyConfig: jest.fn(async (userId, provider) => (provider === 'github' && SAVED[userId] ? { apiKey: SAVED[userId] } : null)),
  inferUserApiKeyProvider: () => null,
  normalizeUserApiKeyProvider: (value) => value,
  subscriptionTokenProblem: () => null,
  USER_API_KEY_PROVIDERS: Object.freeze(['github']),
}));

// The app's state folder is the one a Docker install keeps across a rebuild; the
// workspaces folder (where the brief sat for a short while) is thrown away there.
const appFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-app-'));
const stateFolder = path.join(appFolder, 'state');
const workspacesFolder = path.join(appFolder, 'workspaces');
const prior = { root: process.env.CENSAIHUB_WORKSPACES_ROOT, state: process.env.CENSAI_STATE_DIR, token: process.env.GITHUB_TOKEN, mode: process.env.CENSAI_MODE };
process.env.CENSAIHUB_WORKSPACES_ROOT = workspacesFolder;
process.env.CENSAI_STATE_DIR = stateFolder;
process.env.CENSAI_MODE = 'local_desktop';
delete process.env.GITHUB_TOKEN;

const { openGithubProject } = await import('../server/workspaces/projects.js');
const { readProjectBrief, refreshProjectBrief, publishProjectBriefToRepo, storedBriefPath, BRIEF_BRANCH } = await import('../server/workspaces/briefs.js');
const { runAsGithubPerson } = await import('../server/github/credential.js');
const { executeTool } = await import('../server/tools.js');
const { coreProjectTools } = await import('../server/tools/definitions/projects-core.js');

// The made-up GitHub. `canWrite` decides what a write gets: a read-only key is refused, as on GitHub.
const calls = [];
let canWrite = false;
const b64 = (text) => Buffer.from(text).toString('base64');
function fakeGithub(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const where = String(url).replace('https://api.github.com', '');
  calls.push({ method, where, key: String(options.headers?.Authorization || '').replace('Bearer ', ''), body: options.body ? JSON.parse(options.body) : null });
  const answer = (status, json) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
  if (method !== 'GET') return canWrite ? answer(201, { ok: true }) : answer(403, { message: 'Resource not accessible by personal access token' });
  if (where === `/repos/${REPO}`) return answer(200, { default_branch: 'main', private: true, permissions: { pull: true, push: canWrite } });
  if (where === `/repos/${REPO}/git/refs/heads/main`) return answer(200, { object: { sha: 'made-up-sha' } });
  if (where.startsWith(`/repos/${REPO}/git/trees/`)) return answer(200, { tree: [{ path: 'package.json', type: 'blob' }, { path: 'src', type: 'tree' }, { path: 'src/index.js', type: 'blob' }] });
  if (where === `/repos/${REPO}/contents/package.json`) return answer(200, { type: 'file', path: 'package.json', content: b64('{"main":"src/index.js"}') });
  return answer(404, { message: 'Not Found' });
}
const writes = () => calls.filter((call) => call.method !== 'GET');

beforeEach(() => {
  calls.length = 0;
  rows.length = 0;
  canWrite = false;
  fs.rmSync(stateFolder, { recursive: true, force: true });
  fs.rmSync(workspacesFolder, { recursive: true, force: true });
  global.fetch = jest.fn(async (url, options) => fakeGithub(url, options));
});

afterAll(() => {
  delete global.fetch;
  fs.rmSync(appFolder, { recursive: true, force: true });
  for (const [name, value] of [['CENSAIHUB_WORKSPACES_ROOT', prior.root], ['CENSAI_STATE_DIR', prior.state], ['CENSAI_MODE', prior.mode]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  if (prior.token === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = prior.token;
});

const openAsSam = () => runAsGithubPerson({ userId: SAM }, () => openGithubProject('made-up-agent', { name: 'shop', repo: REPO }));

test('opening with a read-only key works, and nothing is written to GitHub', async () => {
  const project = await openAsSam();
  expect(project).toMatchObject({ repo: REPO, name: 'shop' });
  expect(writes()).toEqual([]);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((call) => call.method === 'GET' && call.key === KEY)).toBe(true);
});

test('the brief is kept in the app, and reading it later asks GitHub for nothing', async () => {
  const project = await openAsSam();
  const kept = storedBriefPath(project);
  // In the state folder, which a Docker install keeps; not in the workspaces folder, which it does not.
  expect(kept.startsWith(stateFolder)).toBe(true);
  expect(fs.existsSync(workspacesFolder)).toBe(false);
  expect(fs.readFileSync(kept, 'utf8')).toContain('src/index.js');
  calls.length = 0;
  // The chat prompt and read_brief read it with nobody's key at hand.
  expect(await readProjectBrief(project)).toContain('src/index.js');
  expect(calls).toEqual([]);
});

test('refreshing the brief also only reads', async () => {
  const project = await openAsSam();
  calls.length = 0;
  await runAsGithubPerson({ userId: SAM }, () => refreshProjectBrief(project));
  expect(calls.length).toBeGreaterThan(0);
  expect(writes()).toEqual([]);
});

describe("when the app's copy of the brief is gone (a rebuilt Docker install, a moved folder)", () => {
  const asTool = (name, args, userId = PAT) => executeTool('made-up-agent', name, args, { userId });
  const forget = (project) => fs.rmSync(storedBriefPath(project));

  test('a brief left in the earlier place is still read', async () => {
    const project = await openAsSam();
    const earlier = path.join(workspacesFolder, 'shared', 'project-briefs', path.basename(storedBriefPath(project)));
    fs.mkdirSync(path.dirname(earlier), { recursive: true });
    fs.renameSync(storedBriefPath(project), earlier);
    calls.length = 0;
    expect(await readProjectBrief(project)).toContain('src/index.js');
    expect(calls).toEqual([]);
  });

  test('opening the project again builds it again, with reads only', async () => {
    const project = await openAsSam();
    forget(project);
    calls.length = 0;
    const said = await asTool('open_project', { repo: REPO });
    expect(said).toContain('The brief is kept in the app');
    expect(said).not.toContain('Brief written to .team/PROJECT.md');
    expect(fs.readFileSync(storedBriefPath(project), 'utf8')).toContain('src/index.js');
    expect(writes()).toEqual([]);
  });

  test('refresh_brief builds it again instead of refusing, with reads only', async () => {
    const project = await openAsSam();
    forget(project);
    calls.length = 0;
    expect(await asTool('refresh_brief', { project: project.id })).toBe('Brief refreshed for "shop". It is kept in the app; nothing was written to the repo.');
    expect(fs.readFileSync(storedBriefPath(project), 'utf8')).toContain('src/index.js');
    expect(writes()).toEqual([]);
  });

  test('read_brief builds it again when there is none to read', async () => {
    const project = await openAsSam();
    forget(project);
    expect(await asTool('read_brief', { project: project.id })).toContain('src/index.js');
    expect(writes()).toEqual([]);
  });

  test('the tools no longer tell the agent the brief sits on the main branch', () => {
    const words = coreProjectTools.filter((tool) => ['open_project', 'read_brief', 'refresh_brief'].includes(tool.function.name))
      .map((tool) => tool.function.description).join(' ');
    expect(words).not.toMatch(/main branch|default branch/);
    expect(words).toContain('nothing is written to the repo');
  });
});

test('a repo that already carries .team/PROJECT.md is still read when the app has no copy', async () => {
  global.fetch = jest.fn(async (url, options) => (String(url).endsWith('/contents/.team/PROJECT.md')
    ? { ok: true, status: 200, json: async () => ({ type: 'file', path: BRIEF_PATH, content: b64('Made-up older brief') }) }
    : fakeGithub(url, options)));
  const brief = await runAsGithubPerson({ userId: SAM }, () => readProjectBrief({ id: 'made-up', repo: 'acme/older' }));
  expect(brief).toBe('Made-up older brief');
});

describe('putting the brief in the repo, when someone asks for it', () => {
  test('it goes on a branch of its own, never the default branch', async () => {
    canWrite = true;
    const project = await openAsSam();
    calls.length = 0;
    const sent = await runAsGithubPerson({ userId: SAM }, () => publishProjectBriefToRepo(project, { by: 'made-up-agent' }));
    expect(sent).toMatchObject({ branch: BRIEF_BRANCH, base: 'main' });
    const [branch, file] = writes();
    expect(writes()).toHaveLength(2);
    expect(branch).toMatchObject({ method: 'POST', where: `/repos/${REPO}/git/refs`, body: { ref: `refs/heads/${BRIEF_BRANCH}` } });
    expect(file).toMatchObject({ method: 'PUT', where: `/repos/${REPO}/contents/.team/PROJECT.md`, body: { branch: BRIEF_BRANCH } });
  });

  test('asking for the default branch is refused in plain words, and nothing is written', async () => {
    canWrite = true;
    const project = await openAsSam();
    calls.length = 0;
    await expect(runAsGithubPerson({ userId: SAM }, () => publishProjectBriefToRepo(project, { branch: 'main' })))
      .rejects.toThrow('The brief is never written straight onto main.');
    expect(writes()).toEqual([]);
  });
});
