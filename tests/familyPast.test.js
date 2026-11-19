import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The family's past: a read-only copy of the owner's old agent folder
// (homebase-db), mounted into censaiOS. A family agent reads any file in it
// as the project "Family past" or by a past:// link, and nothing changes it,
// the owner's own agents included (server/workspaces/familyPast.js). The
// real executeTool and project tools run here on a made-up past in a temp
// folder; the people are made up: Pat Example owns this computer, Sam
// Example is a teammate.
const ROLES = { 1: 'admin', 2: 'user' };
const [PAT, SAM] = [1, 2];
const BOARD = 'made-up-board';
const AGENT = 'atlas';

const pastRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-family-past-'));
const NOTE = 'Made-up memory: we named the garden robot Sprout.';
const notePath = path.join(pastRoot, 'homebase-db', 'FAMILY_CORE', 'MEMORIES', 'Atlas', 'notes.md');
fs.mkdirSync(path.dirname(notePath), { recursive: true });
fs.writeFileSync(notePath, `# Made-up notes\n\n${NOTE}\n`);
const LINK = 'past://homebase-db/FAMILY_CORE/MEMORIES/Atlas/notes.md';

const PAST = { id: 'shared-family-past', name: 'Family past', path: pastRoot, repo: null, owner_agent_id: 'architect', updated_at: '2000-01-01T00:00:00Z' };
// Rows the made-up board gave: by default nothing, so the owner rule decides.
let given = {};
let projectRows = [];

const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };
const log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}, startTimer: () => () => 0 };
const stored = [];
jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => log,
  redactUrl: (url) => url,
  writeLogRecord: () => {},
  onLogRecord: () => () => {},
}));
// The owner's board as it is set up: Trust mode on and each write tool's
// approval module equipped, so a write reaches the project rules and the
// read-only past, not the approval card (server/approvals/requests.js).
const approvalAsked = [];
jest.unstable_mockModule('../server/approvals/requests.js', () => ({
  ToolApprovalError: class ToolApprovalError extends Error {},
  listToolApprovals: async () => [],
  requestToolApprovalIfRequired: async (db, { toolName }) => {
    approvalAsked.push(toolName);
    return { required: false, trusted: true };
  },
}));
jest.unstable_mockModule('../server/embeddings.js', () => ({ embed: async () => null, embeddingsAvailable: () => false, resetAvailability: () => {} }));

const priorRoot = process.env.CENSAI_FAMILY_PAST_DIR;
const priorMode = process.env.CENSAI_MODE;
process.env.CENSAI_FAMILY_PAST_DIR = pastRoot;
const { executeTool } = await import('../server/tools.js');
const { pastLinkToPath, isPastProject, missingPastLinks } = await import('../server/workspaces/familyPast.js');

const use = (name, args, context) => executeTool(AGENT, name, args, context);
const owner = { userId: PAT, workspaceId: BOARD };
const teammate = { userId: SAM, workspaceId: BOARD };
const untouched = () => expect(fs.readFileSync(notePath, 'utf8')).toBe(`# Made-up notes\n\n${NOTE}\n`);

beforeEach(() => {
  jest.clearAllMocks();
  given = {};
  projectRows = [];
  stored.length = 0;
  approvalAsked.length = 0;
  process.env.CENSAI_MODE = 'local_desktop';
  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ');
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.startsWith('INSERT INTO projects')) {
      projectRows = [{ ...PAST, id: params[0], name: params[1], path: params[2] }];
      return { rows: [] };
    }
    if (text.includes('SELECT p.*, wap.permission')) {
      const permission = given[params[2]];
      const project = projectRows.find((p) => p.id === params[2]);
      return { rows: project && permission ? [{ ...project, workspace_permission: permission }] : [] };
    }
    if (text.includes('SELECT permission FROM workspace_agent_projects')) {
      return { rows: given[params[1]] ? [{ permission: given[params[1]] }] : [] };
    }
    if (text.includes('SELECT p.* FROM projects p')) return { rows: projectRows.filter((p) => p.id === params[0]) };
    if (text.includes('FROM projects')) return { rows: projectRows };
    if (text.includes('FROM sub_agents')) return { rows: [] };
    if (text.startsWith('INSERT INTO memories')) {
      stored.push(params[1]);
      return { rows: [{ id: stored.length }] };
    }
    return { rows: [] };
  });
});

afterAll(() => {
  fs.rmSync(pastRoot, { recursive: true, force: true });
  for (const [key, value] of [['CENSAI_FAMILY_PAST_DIR', priorRoot], ['CENSAI_MODE', priorMode]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('a past:// link', () => {
  test('names a path inside the past, and never one outside it', () => {
    expect(pastLinkToPath(LINK)).toBe('homebase-db/FAMILY_CORE/MEMORIES/Atlas/notes.md');
    expect(pastLinkToPath('PAST://homebase-db/GPT-5%20Workspace/a.md')).toBe('homebase-db/GPT-5 Workspace/a.md');
    expect(pastLinkToPath('past://')).toBe('.');
    expect(pastLinkToPath('past://homebase-db/x/../FAMILY_CORE')).toBe('homebase-db/FAMILY_CORE');
    expect(pastLinkToPath('past://../../etc/passwd')).toBe('etc/passwd');
    expect(pastLinkToPath('past://homebase-db/%2E%2E/%2E%2E/x')).toBe('x');
  });

  test('the past is known by its id or by any folder inside it', () => {
    expect(isPastProject(PAST)).toBe(true);
    expect(isPastProject({ id: 'x', path: path.join(pastRoot, 'homebase-db', 'FAMILY_CORE') })).toBe(true);
    expect(isPastProject({ id: 'x', path: `${pastRoot}-not-it` })).toBe(false);
    expect(isPastProject({ id: 'x', path: null, repo: 'made-up/repo' })).toBe(false);
  });

  test('a link to nothing in the past is pointed out', () => {
    expect(missingPastLinks(`See ${LINK}.`)).toEqual([]);
    expect(missingPastLinks('See past://homebase-db/FAMILY_CORE/nope.md and past://homebase-db')).toEqual(['past://homebase-db/FAMILY_CORE/nope.md']);
  });
});

describe('a family agent reads the past', () => {
  test("in the owner's chat on a board, by its link", async () => {
    expect(await use('project_read', { path: LINK }, owner)).toContain(NOTE);
    expect(await use('project_list', { path: 'past://homebase-db/FAMILY_CORE' }, owner)).toContain('[DIR] MEMORIES');
  });

  test('whatever project the call names, the link wins', async () => {
    expect(await use('project_read', { project: 'made-up-other', path: LINK }, owner)).toContain(NOTE);
  });

  test('as the project "Family past", where the board gave it to read', async () => {
    await use('project_list', { path: 'past://' }, owner); // makes the project row
    given = { 'shared-family-past': 'read' };
    expect(await use('project_read', { project: 'shared-family-past', path: 'homebase-db/FAMILY_CORE/MEMORIES/Atlas/notes.md' }, teammate)).toContain(NOTE);
  });

  test("off a board, in the owner's chat", async () => {
    expect(await use('project_read', { path: LINK }, { userId: PAT })).toContain(NOTE);
  });

  test("a teammate's chat keeps the board's list: nothing given, nothing read", async () => {
    expect(await use('project_read', { path: LINK }, teammate)).toMatch(/^Error: PROJECT_ACCESS_DENIED: /);
  });
});

describe('nobody changes the past', () => {
  const READ_ONLY = /^Error: PROJECT_ACCESS_DENIED: The family's past is read only/;

  test.each([
    ['project_write', { path: LINK, content: 'overwritten' }],
    ['project_edit', { path: LINK, old_string: 'Sprout', new_string: 'Weed' }],
  ])("%s by link is refused in the owner's chat", async (name, args) => {
    expect(await use(name, args, owner)).toMatch(READ_ONLY);
    expect(approvalAsked).toContain(name);
    untouched();
  });

  test('by the project name too, even where a board gave it to work in, and off a board', async () => {
    await use('project_list', { path: 'past://' }, owner);
    given = { 'shared-family-past': 'work' };
    const args = { project: 'shared-family-past', path: 'homebase-db/FAMILY_CORE/MEMORIES/Atlas/notes.md', content: 'overwritten' };
    expect(await use('project_write', args, owner)).toMatch(READ_ONLY);
    expect(await use('project_write', args, { userId: PAT })).toMatch(READ_ONLY);
    untouched();
  });
});

describe('new memory links back', () => {
  test('remember keeps a past:// link and points out one that names nothing', async () => {
    expect(await use('remember', { content: `Sprout came from ${LINK}` }, owner)).not.toContain('Note:');
    const said = await use('remember', { content: 'See past://homebase-db/FAMILY_CORE/nope.md' }, owner);
    expect(said).toContain("Note: nothing in the family's past at past://homebase-db/FAMILY_CORE/nope.md");
    expect(stored).toEqual([`Sprout came from ${LINK}`, 'See past://homebase-db/FAMILY_CORE/nope.md']);
  });
});
