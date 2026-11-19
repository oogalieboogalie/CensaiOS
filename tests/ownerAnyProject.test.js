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

const named = (id) => PROJECTS.find((p) => [p.id, p.name, p.path, p.repo].includes(id) || p.path.endsWith(`/${id}`));
const db = {
  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ');
    if (text.includes('FROM users')) return { rows: ROLES[params[0]] ? [{ role: ROLES[params[0]] }] : [] };
    if (text.includes('SELECT p.*, wap.permission')) {
      const project = named(params[2]);
      return { rows: project && GIVEN[project.id] ? [{ ...project, workspace_permission: GIVEN[project.id] }] : [] };
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

test('a project the board gave to read only stays read only, for the owner too', async () => {
  expect((await ask('library', PAT, 'read')).id).toBe('library');
  await expect(ask('library', PAT, 'work')).rejects.toMatchObject({ readOnly: true });
  await expect(assertProjectForDriver(db, { workspaceId: BOARD, projectId: 'library', agentId: 'censai', requiredPermission: 'work' }, { userId: PAT }, cloud))
    .rejects.toMatchObject({ readOnly: true });
});

test('the owner hears plainly when no such project exists', async () => {
  await expect(ask('made-up-cellar', PAT)).rejects.toThrow('There is no project named "made-up-cellar" on this computer.');
});

test('a failing owner check is not mistaken for "not the owner"', async () => {
  const broken = { query: async (sql, params) => (String(sql).includes('FROM users') ? Promise.reject(new Error('database is down')) : db.query(sql, params)) };
  await expect(resolveProjectForDriver(broken, { workspaceId: BOARD, agentId: 'censai', projectIdentifier: 'attic' }, { userId: PAT }, cloud))
    .rejects.toThrow('database is down');
});
