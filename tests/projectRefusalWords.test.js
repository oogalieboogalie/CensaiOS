import { jest } from '@jest/globals';
import { toolCallOk } from '../server/routes/chat/toolOutcome.js';

// When a board refuses an agent a project, the agent tells the person why in
// plain words. On a board that gave the agent other projects, the words name
// them instead of saying none is open, and a project it may only read says
// so. The real executeTool, tools and board checks run here; the database,
// GitHub and the people are made up: Pat Example owns this computer, Sam
// Example is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const [PAT, SAM] = [1, 2];
const AGENT = 'made-up-reader';
const HELPER = 'made-up-helper';
const BOARD = 'made-up-board';
const EMPTY_BOARD = 'made-up-empty-board';
const PROJECTS = {
  'made-up-project': { id: 'made-up-project', name: 'made-up-repo', repo: 'pat-example/made-up-repo', path: null },
  'made-up-notes': { id: 'made-up-notes', name: 'made-up-notes', repo: null, path: '/made-up/notes' },
};
// What each board gave each agent: [board, project, agent, permission].
let given = [];
const GIVEN_ON_BOARD = [[BOARD, 'made-up-project', AGENT, 'read'], [BOARD, 'made-up-notes', AGENT, 'work']];
const TRUST = 'Trust mode does not change this: it only lets agents use the tools they already have without waiting for an OK.';

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
const priorMode = process.env.CENSAI_MODE;

const { executeTool } = await import('../server/tools.js');
const { NO_PROJECT_FILES, projectRefusalWords } = await import('../server/workspaces/projectRefusalWords.js');
const { assertAgentProjectAccess } = await import('../server/workspaces/projectMemberships.js');

const rowsFor = (workspaceId, agentId) => given
  .filter(([board, , agent]) => board === workspaceId && agent === agentId)
  .map(([, projectId, , permission]) => ({
    project_id: projectId, permission,
    project_name: PROJECTS[projectId]?.name ?? projectId, project_repo: PROJECTS[projectId]?.repo ?? null,
  }));

beforeEach(() => {
  jest.clearAllMocks();
  logged.length = 0;
  given = [...GIVEN_ON_BOARD];
  process.env.CENSAI_MODE = 'local_desktop';
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ message: 'Not Found' }) }));
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('FROM sub_agents')) return { rows: params[0] === HELPER ? [{ id: HELPER, parent_id: AGENT }] : [] };
    // The board's projects for the agent (listWorkspaceAgentProjects).
    if (text.includes('AS project_summary')) return { rows: rowsFor(params[0], params[1]) };
    // A repo the board gave the agent (assertAgentRepoAccess).
    if (text.includes('p.repo = $3') && !text.includes('workspace_permission')) {
      return { rows: rowsFor(params[0], params[1]).filter((row) => row.project_repo === params[2]) };
    }
    // A project the board gave the agent, by its name (resolveAuthorizedWorkspaceProject).
    if (text.includes('AS workspace_permission')) {
      const row = rowsFor(params[0], params[1]).find((r) => [r.project_id, r.project_name, r.project_repo].includes(params[2]));
      return { rows: row ? [{ ...PROJECTS[row.project_id], workspace_permission: row.permission }] : [] };
    }
    if (text.includes('SELECT permission FROM workspace_agent_projects')) {
      return { rows: rowsFor(params[0], params[2]).filter((row) => row.project_id === params[1]) };
    }
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

const readRepo = (who, repo, { agent = AGENT, board = BOARD } = {}) => executeTool(agent, 'github_read_file', { repo, path: 'README.md' }, { userId: who, workspaceId: board });
const readProject = (who, project, board = BOARD) => executeTool(AGENT, 'project_read', { project, path: 'README.md' }, { userId: who, workspaceId: board });
const NOT_OPEN = 'Tell the person in plain words: that project is not open for me on this board. '
  + 'The projects open for me here are "pat-example/made-up-repo" (to read only) and "made-up-notes". '
  + `To use another one, open it from the top bar while my chat window is on the board, then ask again. ${TRUST}`;

describe('a project the board did not give the agent', () => {
  test('a repo it was not given gets words that name the projects the board did give it, not "none is open"', async () => {
    for (const who of [SAM, PAT]) {
      const result = await readRepo(who, 'pat-example/made-up-other-repo');
      expect(result).toBe(`Error: PROJECT_ACCESS_DENIED: This agent is not authorized for that repository in the current workspace. ${NOT_OPEN}`);
      expect(result).not.toContain('none is open');
      expect(toolCallOk(result)).toBe(false);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a folder project it was not given gets the same words', async () => {
    expect(await readProject(SAM, 'made-up-other-notes')).toBe(
      `Error: PROJECT_ACCESS_DENIED: This agent is not authorized for that project in the current workspace. ${NOT_OPEN}`
    );
  });

  test('a board that gave it no project still says none is open, and how to open one', async () => {
    expect(await readRepo(SAM, 'pat-example/made-up-repo', { board: EMPTY_BOARD })).toBe(
      `Error: PROJECT_ACCESS_DENIED: This agent is not authorized for that repository in the current workspace. ${NO_PROJECT_FILES}`
    );
  });

  test("a board's own helper agent names the projects the board gave the agent it belongs to", async () => {
    expect(await readRepo(SAM, 'pat-example/made-up-other-repo', { agent: HELPER })).toBe(
      `Error: PROJECT_ACCESS_DENIED: This agent is not authorized for that repository in the current workspace. ${NOT_OPEN}`
    );
  });

  test('one project is named on its own; a project given twice is named once; past six the rest are counted', async () => {
    given = [[BOARD, 'made-up-notes', AGENT, 'work']];
    expect(await projectRefusalWords(AGENT, { workspaceId: BOARD })).toContain('The project open for me here is "made-up-notes". To use another one');
    given = [[BOARD, 'made-up-project', AGENT, 'read'], [BOARD, 'made-up-project', AGENT, 'work']];
    expect(await projectRefusalWords(AGENT, { workspaceId: BOARD })).toContain('The project open for me here is "pat-example/made-up-repo". To use');
    given = Array.from({ length: 8 }, (_, i) => [BOARD, `made-up-${i + 1}`, AGENT, 'work']);
    expect(await projectRefusalWords(AGENT, { workspaceId: BOARD })).toContain(
      'The projects open for me here are "made-up-1", "made-up-2", "made-up-3", "made-up-4", "made-up-5", "made-up-6" and 2 more.'
    );
  });
});

describe('a project the board gave the agent to read only', () => {
  test('asked to change it, the agent says it may read it there but not change it', async () => {
    const refused = await assertAgentProjectAccess(pool, { workspaceId: BOARD, projectId: 'made-up-project', agentId: AGENT, requiredPermission: 'work' }).catch((err) => err);
    expect(refused).toMatchObject({ code: 'PROJECT_ACCESS_DENIED', readOnly: true, message: 'This agent has read-only project access in the current workspace.' });
    expect(await projectRefusalWords(AGENT, { workspaceId: BOARD }, refused)).toBe(
      'Tell the person in plain words: on this board I can read that project but not change it. '
      + `The projects open for me here are "pat-example/made-up-repo" (to read only) and "made-up-notes". ${TRUST}`
    );
  });

  test('a project it was not given at all is not called read-only when it is asked to change it', async () => {
    const refused = await assertAgentProjectAccess(pool, { workspaceId: BOARD, projectId: 'made-up-other-notes', agentId: AGENT, requiredPermission: 'work' }).catch((err) => err);
    expect(refused).toMatchObject({ code: 'PROJECT_ACCESS_DENIED', message: 'This agent is not authorized for that project in the current workspace.' });
    expect(refused.readOnly).toBeUndefined();
  });
});

describe('what is never said or logged', () => {
  test("when the board's projects cannot be read the words say none is open, and the log has no project", async () => {
    pool.query.mockImplementationOnce(async () => { throw new Error('made-up database outage'); });
    expect(await projectRefusalWords(AGENT, { workspaceId: BOARD })).toBe(NO_PROJECT_FILES);
    expect(logged).toEqual(['warn could not list the board projects for a refusal {"code":null}']);
  });

  test('off a board the words never name a project', async () => {
    expect(await projectRefusalWords(AGENT, {})).toBe(NO_PROJECT_FILES);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('a refusal never logs the projects it names', async () => {
    await readRepo(SAM, 'pat-example/made-up-other-repo');
    await readProject(SAM, 'made-up-other-notes');
    expect(logged.join('\n')).not.toMatch(/made-up-repo|made-up-notes|made-up-other/);
  });
});
