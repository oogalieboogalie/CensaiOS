import { jest } from '@jest/globals';
import { toolCallOk } from '../server/routes/chat/toolOutcome.js';

// An agent reads GitHub with this computer's GitHub key for whoever drives its
// chat: a repo by its name, or a project opened from a GitHub repo. On a board
// it reads the repos the board gave it; off a board (a chat sent with no
// board, a run started from elsewhere) no repo is shared, so only the
// computer's owner's agents read there and a teammate's agent gets plain
// words. Changing something with the key was the owner's alone already. The
// real executeTool and GitHub tools run here; GitHub itself and the people are
// made up: Pat Example owns this computer, Sam Example is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const [PAT, SAM] = [1, 2];
const REPO = 'pat-example/made-up-repo';
const BOARD = 'made-up-board';
// The repos the made-up board gave the agent.
const GIVEN = new Map([[REPO, 'made-up-project']]);
// The made-up repo, opened on this computer as a GitHub project.
const PROJECT = { id: 'made-up-project', name: 'made-up-repo', repo: REPO, path: null, owner_agent_id: 'shared' };

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const logged = [];
const record = (level) => (message, meta) => logged.push(`${level} ${message} ${meta ? JSON.stringify(meta) : ''}`);
const log = { error: record('error'), warn: record('warn'), info: record('info'), debug: record('debug'), trace: () => {}, startTimer: () => () => 0 };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => log,
  redactUrl: (url) => url,
  writeLogRecord: () => {},
  onLogRecord: () => () => {},
}));
const priorToken = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = 'made-up-token';

const { executeTool } = await import('../server/tools.js');
const { GITHUB_OFF_BOARD, PROJECT_OFF_BOARD } = await import('../server/tools/rbac/ownerOnlyReads.js');
const { OWNER_UNCHECKED_MESSAGE } = await import('../server/security/systemAdmin.js');

// A shared agent the owner gave GitHub reads to (not one of the built-in family).
const AGENT = 'made-up-reader';
const README = 'Made-up readme: the plan for the made-up repo.';
const REFUSED = `Error: ${GITHUB_OFF_BOARD}`;
const priorMode = process.env.CENSAI_MODE;

function githubAnswer(url, method = 'GET') {
  if (method === 'POST' && String(url).endsWith(`/repos/${REPO}/issues`)) {
    return { number: 8, html_url: 'https://made-up.example/issues/8' };
  }
  if (String(url).endsWith(`/repos/${REPO}/contents/README.md`)) {
    return { type: 'file', path: 'README.md', content: Buffer.from(README).toString('base64') };
  }
  if (String(url).includes(`/repos/${REPO}/issues`)) {
    return [{ number: 7, state: 'open', title: 'Made-up issue', user: { login: 'pat-example' } }];
  }
  return { message: 'Not Found' };
}

beforeEach(() => {
  jest.clearAllMocks();
  logged.length = 0;
  process.env.CENSAI_MODE = 'local_desktop';
  global.fetch = jest.fn(async (url, options = {}) => ({ ok: true, status: 200, json: async () => githubAnswer(url, options.method) }));
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('JOIN projects')) {
      const [workspaceId, , repo] = params;
      return { rows: workspaceId === BOARD && GIVEN.has(repo) ? [{ project_id: GIVEN.get(repo) }] : [] };
    }
    if (text.includes('FROM workspace_agent_projects')) return { rows: [{ permission: 'read' }] };
    if (text.includes('FROM projects')) return { rows: params[0] === PROJECT.id ? [PROJECT] : [] };
    if (text.includes('FROM sub_agents')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });
});

afterAll(() => {
  delete global.fetch;
  if (priorToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = priorToken;
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

// Changes with this computer's GitHub key: the owner's alone, on a board or off it.
const WRITES = [
  ['github_write_file', { repo: REPO, path: 'made-up-notes.md', content: 'Made-up words', message: 'Made-up change' }],
  ['github_create_issue', { repo: REPO, title: 'Made-up issue', body: 'Made-up words' }],
  ['github_comment_issue', { repo: REPO, issue_number: 7, body: 'Made-up comment' }],
];
const readFile = (context, repo = REPO) => executeTool(AGENT, 'github_read_file', { repo, path: 'README.md' }, context);
const listIssues = (context) => executeTool(AGENT, 'github_list_issues', { repo: REPO }, context);
const readProject = (context) => executeTool(AGENT, 'project_read', { project: PROJECT.id, path: 'README.md' }, context);
const prStatus = (context) => executeTool(AGENT, 'pr_status', { project: PROJECT.id, pr_number: 7 }, context);

describe('off a board', () => {
  test("Sam's agent gets plain words for a file and for the issues, and GitHub is never asked", async () => {
    for (const result of [await readFile({ userId: SAM }), await listIssues({ userId: SAM })]) {
      expect(result).toBe(REFUSED);
      expect(toolCallOk(result)).toBe(false);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("Pat's agent still reads the file and the issues", async () => {
    expect(await readFile({ userId: PAT })).toBe(README);
    expect(await listIssues({ userId: PAT })).toBe('#7 [open] Made-up issue (by pat-example)');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("Sam's agent cannot write a file, open an issue or comment either (the owner's alone, as before), while Pat's still opens an issue", async () => {
    for (const [tool, args] of WRITES) expect(await executeTool(AGENT, tool, args, { userId: SAM })).toMatch(/^Error: COMPUTER_OWNER_ONLY: /);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await executeTool(AGENT, ...WRITES[1], { userId: PAT })).toBe('Created issue #8: https://made-up.example/issues/8');
  });

  test("work the desktop app runs for itself reads; elsewhere a call with no one behind it is refused", async () => {
    expect(await readFile({})).toBe(README);
    for (const mode of ['private_server', 'cloud_saas']) {
      process.env.CENSAI_MODE = mode;
      expect(await readFile({})).toBe(REFUSED);
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("Sam's agent cannot read the repo as a GitHub project either, while Pat's can", async () => {
    // Off a board no project is shared, a GitHub one or a folder (tests/projectsOffBoard.test.js).
    for (const result of [await readProject({ userId: SAM }), await prStatus({ userId: SAM })]) {
      expect(result).toBe(`Error: ${PROJECT_OFF_BOARD}`);
    }
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await readProject({ userId: PAT })).toContain(README);
  });

  test("an account that is not there is refused; when the owner cannot be checked right now, it says so", async () => {
    expect(await readFile({ userId: 99 })).toBe(REFUSED);
    pool.query.mockRejectedValueOnce(new Error('made-up database outage'));
    expect(await readFile({ userId: PAT })).toBe(`Error: ${OWNER_UNCHECKED_MESSAGE}`);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logged.filter((line) => line.includes('account 1'))).toEqual([]);
  });

  test('a refusal is logged with the account number only: never the repo, the file or what it holds', async () => {
    await readFile({ userId: SAM });
    await readProject({ userId: SAM });
    const refusals = logged.filter((line) => line.includes('not the owner'));
    expect(refusals).toEqual([
      `info refused agent tool github_read_file off a board for account ${SAM}: not the owner `,
      `info refused agent use of a project off a board for account ${SAM}: not the owner `,
    ]);
    expect(logged.join('\n')).not.toMatch(/made-up-repo|made-up-project|README|Made-up readme/);
  });
});

describe('on a board, as before', () => {
  test("Sam's agent reads a repo the board gave it", async () => {
    expect(await readFile({ userId: SAM, workspaceId: BOARD })).toBe(README);
  });

  test("a repo the board did not give the agent is refused for Sam and Pat alike", async () => {
    for (const who of [SAM, PAT]) {
      const result = await readFile({ userId: who, workspaceId: BOARD }, 'pat-example/made-up-other-repo');
      expect(result).toMatch(/^Error: PROJECT_ACCESS_DENIED: /);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
