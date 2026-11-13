import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { toolCallOk } from '../server/routes/chat/toolOutcome.js';

// Off a board (a chat sent to censaiOS with no board, as a teammate's own
// browser can send one, or a run started elsewhere) no project is shared with
// anyone, so only this computer's owner's agents find, list or read one there.
// On a board an agent works in the projects the board gave it, as before. The
// real executeTool and project tools run here on a made-up folder project; the
// people are made up: Pat Example owns this computer, Sam Example is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const [PAT, SAM] = [1, 2];
const BOARD = 'made-up-board';
// A helper agent (not one of the built-in family), so no module stands between the chat and the tool.
const AGENT = 'made-up-helper';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-projects-off-board-'));
const folder = path.join(tempRoot, 'made-up-plans');
const NOTE = 'Made-up note: the bake sale is on Saturday.';
const BRIEF = 'Made-up brief: plans for the bake sale.';
const PROJECT = { id: 'made-up-folder-project', name: 'made-up-plans', path: folder, repo: null, owner_agent_id: 'shared', updated_at: '2026-10-30T00:00:00Z' };
fs.mkdirSync(path.join(folder, '.team'), { recursive: true });
fs.writeFileSync(path.join(folder, 'notes.md'), `# Made-up notes\n\n${NOTE}\n`);
fs.writeFileSync(path.join(folder, '.team', 'PROJECT.md'), BRIEF);
fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'made-up-plans', dependencies: { 'made-up-pkg': '1.0.0' } }));

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

const { executeTool } = await import('../server/tools.js');
const { PROJECT_OFF_BOARD } = await import('../server/tools/rbac/ownerOnlyReads.js');
const { OWNER_UNCHECKED_MESSAGE } = await import('../server/security/systemAdmin.js');

const REFUSED = `Error: ${PROJECT_OFF_BOARD}`;
const priorMode = process.env.CENSAI_MODE;
// The project tools that only look, each asked about the made-up project.
const LOOKS = [
  ['list_projects', {}],
  ['read_brief', { project: PROJECT.id }],
  ['project_read', { project: PROJECT.id, path: 'notes.md' }],
  ['project_list', { project: PROJECT.id, path: '.' }],
  ['project_file_outline', { project: PROJECT.id, path: 'notes.md' }],
  ['analyze_deps', { project: PROJECT.id, mode: 'imports' }],
];
const use = (name, args, context) => executeTool(AGENT, name, args, context);
const read = (context, project = PROJECT.id) => use('project_read', { project, path: 'notes.md' }, context);
const askedForProjects = () => pool.query.mock.calls.some(([sql]) => String(sql).includes('projects'));

beforeEach(() => {
  jest.clearAllMocks();
  logged.length = 0;
  process.env.CENSAI_MODE = 'local_desktop';
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    // The made-up board gave the agent the made-up project to read.
    if (text.includes('JOIN projects')) return { rows: params[0] === BOARD ? [{ ...PROJECT, workspace_permission: 'read' }] : [] };
    if (text.includes('FROM workspace_agent_projects')) return { rows: [{ permission: 'read' }] };
    if (text.includes('FROM projects')) return { rows: [PROJECT] };
    if (text.includes('FROM sub_agents')) return { rows: [] };
    throw new Error(`Unexpected query: ${text}`);
  });
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

describe('off a board', () => {
  test.each(LOOKS)("Sam's agent gets plain words for %s, and no project is looked up", async (name, args) => {
    const result = await use(name, args, { userId: SAM });
    expect(result).toBe(REFUSED);
    expect(toolCallOk(result)).toBe(false);
    expect(askedForProjects()).toBe(false);
  });

  test("Sam's agent cannot reach the project by its name or its folder either", async () => {
    for (const project of [PROJECT.name, folder]) expect(await read({ userId: SAM }, project)).toBe(REFUSED);
    expect(askedForProjects()).toBe(false);
  });

  test("a dependency audit of the project by its name gives Sam's agent the same plain words", async () => {
    expect(await use('vulnerability_audit', { project: PROJECT.id }, { userId: SAM })).toContain(PROJECT_OFF_BOARD);
    expect(askedForProjects()).toBe(false);
  });

  test("Pat's agent still finds, lists and reads the project", async () => {
    expect(await use('list_projects', {}, { userId: PAT })).toContain(PROJECT.name);
    expect(await use('read_brief', { project: PROJECT.id }, { userId: PAT })).toBe(BRIEF);
    expect(await read({ userId: PAT })).toContain(NOTE);
    expect(await read({ userId: PAT }, PROJECT.name)).toContain(NOTE);
    expect(await use('project_list', { project: PROJECT.id, path: '.' }, { userId: PAT })).toContain('notes.md');
    expect(await use('analyze_deps', { project: PROJECT.id, mode: 'imports' }, { userId: PAT })).toContain('made-up-pkg');
  });

  test('work the desktop app runs for itself reads; elsewhere a call with no one behind it is refused', async () => {
    expect(await read({})).toContain(NOTE);
    for (const mode of ['private_server', 'cloud_saas']) {
      process.env.CENSAI_MODE = mode;
      expect(await read({})).toBe(REFUSED);
    }
  });

  test('an account that is not there is refused; when the owner cannot be checked right now, it says so', async () => {
    expect(await read({ userId: 99 })).toBe(REFUSED);
    pool.query.mockRejectedValueOnce(new Error('made-up database outage'));
    expect(await read({ userId: PAT })).toBe(`Error: ${OWNER_UNCHECKED_MESSAGE}`);
  });

  test('a refusal is logged with the account number only: never the project, its folder or its words', async () => {
    for (const [name, args] of LOOKS) await use(name, args, { userId: SAM });
    const refusals = logged.filter((line) => line.includes('not the owner'));
    expect(refusals).toEqual(LOOKS.map(() => `info refused agent use of a project off a board for account ${SAM}: not the owner `));
    expect(logged.join('\n')).not.toMatch(/made-up-plans|made-up-folder-project|notes\.md|bake sale|censai-projects-off-board/);
  });
});

describe('on a board, as before', () => {
  test("Sam's agent reads the project the board gave it", async () => {
    expect(await read({ userId: SAM, workspaceId: BOARD })).toContain(NOTE);
  });

  test("a project the board did not give the agent is refused for Sam and Pat alike", async () => {
    for (const who of [SAM, PAT]) {
      expect(await read({ userId: who, workspaceId: 'made-up-other-board' })).toMatch(/^Error: PROJECT_ACCESS_DENIED: /);
    }
  });
});
