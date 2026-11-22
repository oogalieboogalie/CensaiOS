import { ownerDrives, assertProjectForDriver, assertRepoForDriver } from '../server/workspaces/ownerProjects.js';
import { resolveProjectForDriver } from '../server/workspaces/ownerProjectLookup.js';

// On a board an agent works in the projects the board gave it. This
// computer's owner is not held to that list: when the owner drives the chat,
// an agent works in any project on the computer. A teammate's chat is.
// Made-up board: Pat owns this computer, Sam is a teammate. The board gave
// Censai "garden" to work in and "library" to read. Nobody gave it "attic".
const BOARD = 'made-up-board';
const [PAT, SAM] = [1, 2];
const ROLES = { [PAT]: 'admin', [SAM]: 'user' };
const PROJECTS = [
  { id: 'garden', name: 'made-up-garden', path: '/made-up/garden', repo: null },
  { id: 'library', name: 'made-up-library', path: '/made-up/library', repo: 'made-up/library' },
  { id: 'attic', name: 'made-up-attic', path: '/made-up/attic', repo: 'made-up/attic' },
];
const GIVEN = { garden: 'work', library: 'read' };
// What each board has open for any of its agents: [project, may it be changed].
// One board has only the garden, one only the library to read, one has nothing.
const [ONE, READING, BARE] = ['made-up-one-project-board', 'made-up-reading-board', 'made-up-bare-board'];
const ON_BOARD = { [BOARD]: [['garden', true], ['library', false]], [ONE]: [['garden', true]], [READING]: [['library', false]], [BARE]: [] };
// Trust mode, board-wide: off on the two boards with a read-only project unless a test turns it on.
const TRUST = { [BOARD]: false, [READING]: false };

const named = (id) => PROJECTS.find((p) => [p.id, p.name, p.path, p.repo].includes(id) || p.path.endsWith(`/${id}`));
const db = {
  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ');
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('FROM workspace_agent_trust')) {
      return { rows: params[0] in TRUST ? [{ agent_id: '*', trusted: TRUST[params[0]] }] : [] };
    }
    if (text.includes('SELECT p.*, wap.permission')) {
      // Only Censai was given anything, and only on the first board.
      if (params[0] !== BOARD || params[1] !== 'censai') return { rows: [] };
      const project = named(params[2]);
      return { rows: project && GIVEN[project.id] ? [{ ...project, workspace_permission: GIVEN[project.id] }] : [] };
    }
    if (text.includes('bool_or(wap.permission')) {
      return { rows: (ON_BOARD[params[0]] || []).map(([id, work]) => ({ ...named(id), board_work: work })) };
    }
    if (text.includes('SELECT wap.project_id')) {
      const project = PROJECTS.find((p) => p.repo === params[2]);
      return { rows: project && GIVEN[project.id] ? [{ project_id: project.id }] : [] };
    }
    if (text.includes('SELECT permission FROM workspace_agent_projects')) {
      return { rows: GIVEN[params[1]] ? [{ permission: GIVEN[params[1]] }] : [] };
    }
    if (text.includes('SELECT p.* FROM projects p')) {
      const project = named(params[0]);
      return { rows: project ? [project] : [] };
    }
    throw new Error(`the made-up database has no answer for: ${text.slice(0, 60)}`);
  },
};
const cloud = { mode: 'cloud_saas' };
const ask = (project, userId, permission = 'read') => resolveProjectForDriver(
  db, { workspaceId: BOARD, agentId: 'censai', projectIdentifier: project, requiredPermission: permission }, { userId }, cloud
);

test("the owner's chat is the owner's; a teammate's and a nameless one on a server are not", async () => {
  expect(await ownerDrives({ userId: PAT }, { db, ...cloud })).toBe(true);
  expect(await ownerDrives({ userId: SAM }, { db, ...cloud })).toBe(false);
  expect(await ownerDrives({}, { db, ...cloud })).toBe(false);
  expect(await ownerDrives({}, { db, mode: 'local_desktop' })).toBe(true);
  expect(await ownerDrives({ userId: 99 }, { db, ...cloud })).toBe(false);
});

test('a project the board gave works for everyone, as before', async () => {
  expect((await ask('garden', SAM, 'work')).id).toBe('garden');
  expect((await ask('garden', PAT, 'work')).id).toBe('garden');
});

test('the owner sends an agent into a project the board never gave it', async () => {
  expect((await ask('attic', PAT, 'work')).id).toBe('attic');
  expect((await ask('made-up-attic', PAT)).id).toBe('attic');
  expect((await ask('/made-up/attic', PAT)).id).toBe('attic');
  await expect(assertProjectForDriver(db, { workspaceId: BOARD, projectId: 'attic', agentId: 'censai', requiredPermission: 'work' }, { userId: PAT }, cloud))
    .resolves.toMatchObject({ permission: 'work' });
  await expect(assertRepoForDriver(db, { workspaceId: BOARD, repo: 'made-up/attic', agentId: 'censai', requiredPermission: 'work' }, { userId: PAT }, cloud))
    .resolves.toMatchObject({ permission: 'work' });
});

test('a teammate is still refused a project the board never gave', async () => {
  await expect(ask('attic', SAM)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  await expect(assertProjectForDriver(db, { workspaceId: BOARD, projectId: 'attic', agentId: 'censai' }, { userId: SAM }, cloud))
    .rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  await expect(assertRepoForDriver(db, { workspaceId: BOARD, repo: 'made-up/attic', agentId: 'censai' }, { userId: SAM }, cloud))
    .rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
});

test('with Trust mode off, a project the board gave to read only stays read only, for the owner too', async () => {
  expect((await ask('library', PAT, 'read')).id).toBe('library');
  await expect(ask('library', PAT, 'work')).rejects.toMatchObject({ readOnly: true });
  await expect(assertProjectForDriver(db, { workspaceId: BOARD, projectId: 'library', agentId: 'censai', requiredPermission: 'work' }, { userId: PAT }, cloud))
    .rejects.toMatchObject({ readOnly: true });
});

// Genesis was given nothing on any board, and its calls name no project.
const askGenesis = (board, userId, permission = 'read') => resolveProjectForDriver(
  db, { workspaceId: board, agentId: 'genesis', projectIdentifier: null, requiredPermission: permission }, { userId }, cloud
);

test('the owner asks an agent the board gave nothing, naming no project: it works in the one project open on the board', async () => {
  const project = await askGenesis(ONE, PAT, 'work');
  expect(project.id).toBe('garden');
  expect(project).not.toHaveProperty('board_work');
  expect((await askGenesis(ONE, PAT)).path).toBe('/made-up/garden');
});

test('the same call from a teammate is still refused', async () => {
  await expect(askGenesis(ONE, SAM)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  await expect(askGenesis(BOARD, SAM)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
});

test('with several projects open on the board the owner is told their names, not sent into one', async () => {
  await expect(askGenesis(BOARD, PAT)).rejects.toMatchObject({ code: 'PROJECT_NAME_NEEDED' });
  await expect(askGenesis(BOARD, PAT)).rejects.toThrow('"made-up-garden", "made-up-library"');
});

test('with Trust mode off, a board with only a read-only project lets the owner read it there, not change it', async () => {
  expect((await askGenesis(READING, PAT, 'read')).id).toBe('library');
  await expect(askGenesis(READING, PAT, 'work')).rejects.toMatchObject({ readOnly: true });
});

test('a board with no project open still refuses, as before', async () => {
  await expect(askGenesis(BARE, PAT)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
});

test('the owner hears plainly when no such project exists', async () => {
  await expect(ask('made-up-cellar', PAT)).rejects.toThrow('There is no project named "made-up-cellar" on this computer.');
});

test('a failing owner check is not mistaken for "not the owner"', async () => {
  const broken = { query: async (sql, params) => (String(sql).includes('FROM users') ? Promise.reject(new Error('database is down')) : db.query(sql, params)) };
  await expect(resolveProjectForDriver(broken, { workspaceId: BOARD, agentId: 'censai', projectIdentifier: 'attic' }, { userId: PAT }, cloud))
    .rejects.toThrow('database is down');
});

// Trust mode on, on the owner's own computer: no walls for the owner's agents (server/workspaces/ownerTrust.js).
describe('with Trust mode on', () => {
  beforeEach(() => { TRUST[BOARD] = true; TRUST[READING] = true; });
  afterEach(() => { TRUST[BOARD] = false; TRUST[READING] = false; });

  test("the owner's agent changes a project the board gave it to read only", async () => {
    expect((await ask('library', PAT, 'work')).id).toBe('library');
    expect((await askGenesis(READING, PAT, 'work')).id).toBe('library');
  });

  test('a teammate is held to read only and to the board\'s list, whatever the switch says', async () => {
    await expect(ask('library', SAM, 'work')).rejects.toMatchObject({ readOnly: true });
    await expect(ask('attic', SAM)).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
    await expect(askGenesis(READING, SAM, 'work')).rejects.toMatchObject({ code: 'PROJECT_ACCESS_DENIED' });
  });

  test('trust turned off for one agent keeps that agent fenced', async () => {
    const oneOff = { query: async (sql, params) => (String(sql).includes('FROM workspace_agent_trust')
      ? { rows: [{ agent_id: '*', trusted: true }, { agent_id: 'censai', trusted: false }] }
      : db.query(sql, params)) };
    await expect(resolveProjectForDriver(oneOff, { workspaceId: BOARD, agentId: 'censai', projectIdentifier: 'library', requiredPermission: 'work' }, { userId: PAT }, cloud))
      .rejects.toMatchObject({ readOnly: true });
  });
});
