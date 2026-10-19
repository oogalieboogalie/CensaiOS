// An agent's tools act for whoever is driving the chat. Tools that change this
// computer (commands, git, Docker, files, the app's database) only run when
// that person is the computer's owner; a teammate gets "Only this computer's
// owner can do this." Tools that only look stay open to everyone.
//
// The real executeTool / executeApprovedTool run here; each tool's handler is a
// stand-in that says "ran" instead of touching the disk, git or Docker.
import { jest } from '@jest/globals';
import { toolCallOk } from '../server/routes/chat/toolOutcome.js';

// Pretend people, never real ones: Pat owns this computer; Mo is a teammate
// who can edit Pat's board.
const ROLES = { 1: 'admin', 2: 'user' };
const PAT = 1;
const MO = 2;

const ran = jest.fn(async () => 'ran');
const pool = { query: jest.fn(), connect: jest.fn(), on: jest.fn(), end: jest.fn() };

jest.unstable_mockModule('../server/db.js', () => ({ default: pool, createDbPool: () => pool }));
jest.unstable_mockModule('../server/memory.js', () => ({
  getAgent: jest.fn(async () => null),
  getSubAgentById: jest.fn(async () => null),
}));
jest.unstable_mockModule('../server/approvals/decisions.js', () => ({
  assertApprovedToolExecution: jest.fn(async () => ({ ok: true })),
}));

const { HOST_CHANGING_TOOL_NAMES, changesHost } = await import('../server/tools/rbac/hostOwnerOnly.js');
const { OWNER_ONLY_MESSAGE } = await import('../server/security/systemAdmin.js');

const READ_ONLY = ['local_git_status', 'local_read_file', 'local_list_dir', 'container_status',
  'container_logs', 'project_read', 'project_list', 'vex_status', 'pr_status'];
const ALL = [...HOST_CHANGING_TOOL_NAMES, ...READ_ONLY, 'vex_run', 'postgres_query', 'postgres_exec_file'];

jest.unstable_mockModule('../server/tools/handlers/index.js', () => ({
  TOOL_REGISTRY: Object.fromEntries(ALL.map((name) => [name, ran])),
}));

const { executeTool, executeApprovedTool } = await import('../server/tools.js');

// A helper agent (not one of the built-in family), so no module or approval
// setup stands between the chat and the tool.
const AGENT = 'helper-bot';
const REFUSED = `Error: COMPUTER_OWNER_ONLY: ${OWNER_ONLY_MESSAGE}`;
const priorMode = process.env.CENSAI_MODE;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CENSAI_MODE = 'local_desktop';
  pool.query.mockImplementation(async (_sql, [id]) => ({ rows: ROLES[id] ? [{ role: ROLES[id] }] : [] }));
});

afterAll(() => {
  if (priorMode === undefined) delete process.env.CENSAI_MODE;
  else process.env.CENSAI_MODE = priorMode;
});

describe("a teammate's chat cannot change the computer", () => {
  test.each(HOST_CHANGING_TOOL_NAMES)('%s is refused for a teammate', async (name) => {
    const result = await executeTool(AGENT, name, { path: 'notes.txt', command: 'npm test' }, { userId: MO });
    expect(result).toBe(REFUSED);
    expect(toolCallOk(result)).toBe(false);
    expect(ran).not.toHaveBeenCalled();
  });

  test('a Vex run that starts agents is refused; a security scan is not', async () => {
    expect(await executeTool(AGENT, 'vex_run', { task: 'demo' }, { userId: MO })).toBe(REFUSED);
    expect(await executeTool(AGENT, 'vex_run', {}, { userId: MO })).toBe(REFUSED);
    expect(ran).not.toHaveBeenCalled();
    expect(await executeTool(AGENT, 'vex_run', { task: 'vulnerability_check' }, { userId: MO })).toBe('ran');
  });

  test.each(['postgres_query', 'postgres_exec_file'])('%s may read but not write for a teammate', async (name) => {
    expect(await executeTool(AGENT, name, { sql: 'DELETE FROM users', allow_write: true }, { userId: MO }))
      .toBe(REFUSED);
    expect(ran).not.toHaveBeenCalled();
    expect(await executeTool(AGENT, name, { sql: 'SELECT 1' }, { userId: MO })).toBe('ran');
  });

  test('an owner approving a card still runs it; a teammate approving does not', async () => {
    expect(await executeApprovedTool(AGENT, 'terminal_run', { command: 'ls' }, { userId: MO }, 'appr-1'))
      .toBe(REFUSED);
    expect(ran).not.toHaveBeenCalled();
    expect(await executeApprovedTool(AGENT, 'terminal_run', { command: 'ls' }, { userId: PAT }, 'appr-1'))
      .toBe('ran');
  });

  test('a person the computer does not know is refused', async () => {
    expect(await executeTool(AGENT, 'run_tests', {}, { userId: 99 })).toBe(REFUSED);
    expect(ran).not.toHaveBeenCalled();
  });

  test('when the owner check itself fails, nothing runs', async () => {
    pool.query.mockRejectedValueOnce(new Error('database down'));
    const result = await executeTool(AGENT, 'project_write', { path: 'a.txt' }, { userId: PAT });
    expect(result).toMatch(/^Error: COMPUTER_OWNER_ONLY: Couldn't check who owns this computer/);
    expect(ran).not.toHaveBeenCalled();
  });

  test('outside the desktop app, a call with no person behind it is refused', async () => {
    for (const mode of ['private_server', 'cloud_saas']) {
      process.env.CENSAI_MODE = mode;
      expect(await executeTool(AGENT, 'local_write_file', { path: 'a.txt' }, {})).toBe(REFUSED);
    }
    expect(ran).not.toHaveBeenCalled();
  });
});

describe('the owner notices nothing', () => {
  test.each(HOST_CHANGING_TOOL_NAMES)('%s runs for the owner', async (name) => {
    expect(await executeTool(AGENT, name, { path: 'notes.txt' }, { userId: PAT })).toBe('ran');
  });

  test("the desktop app's own background work (no person behind it) still runs", async () => {
    expect(await executeTool(AGENT, 'run_tests', {}, {})).toBe('ran');
  });
});

describe('looking stays open to teammates', () => {
  test.each(READ_ONLY)('%s runs for a teammate', async (name) => {
    expect(changesHost(name, {})).toBe(false);
    expect(await executeTool(AGENT, name, { path: 'notes.txt' }, { userId: MO })).toBe('ran');
  });
});
