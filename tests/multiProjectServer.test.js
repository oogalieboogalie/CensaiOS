import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

// Identity runtime mapping so temp dirs compare directly.
jest.unstable_mockModule('../server/workspaces/shared.js', () => ({
  getWorkspacesRoot: () => process.cwd(),
  mapProjectPathForRuntime: (p) => p,
  normalizeProjectPathForStorage: (p) => p,
  resolveProjectPathForRuntime: (p) => p,
  safeAgentId: (id) => String(id).toLowerCase(),
  safeName: (name) => name,
}));

// Isolated local state (never the checkout's .homebase-state).
const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'censai-mp-state-'));
process.env.CENSAI_STATE_DIR = stateDir;

const shared = await import('../server/routes/projects/shared.js');
const { projectRootContaining } = await import('../server/routes/files/pathUtils.js');

let dirA;
let dirB;

beforeAll(async () => {
  dirA = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proj-a-'));
  dirB = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proj-b-'));
  await shared.writeCurrentProject({ type: 'local', name: 'Alpha', path: dirA, projectId: 'p-a' });
  await shared.registerOpenProject(dirB);
  await shared.registerOpenProject(dirA);
});

afterAll(async () => {
  delete process.env.CENSAI_STATE_DIR;
  for (const d of [stateDir, dirA, dirB]) await fs.promises.rm(d, { recursive: true, force: true });
});

describe('multi-project board on the server', () => {
  test('state lives in CENSAI_STATE_DIR', () => {
    expect(fs.existsSync(path.join(stateDir, 'current-project.json'))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, 'open-projects.json'))).toBe(true);
  });

  test('lists every open project once, the default first', async () => {
    const roots = await shared.listOpenProjectRoots();
    expect(roots.map((r) => [r.path, r.isDefault])).toEqual([[dirA, true], [dirB, false]]);
    expect(roots[0].name).toBe('Alpha');
  });

  test('a request names its window project; without one the default applies', async () => {
    expect((await shared.resolveRequestedProject()).path).toBe(dirA);
    expect((await shared.resolveRequestedProject(dirB)).path).toBe(dirB);
    expect((await shared.resolveRequestedProject(`${dirB}${path.sep}`)).path).toBe(dirB);
  });

  test('a folder that is not open on the board is refused', async () => {
    await expect(shared.resolveRequestedProject(path.join(os.tmpdir(), 'not-open')))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('backlinks search the project a note lives in', async () => {
    expect(await projectRootContaining(path.join(dirB, 'notes', 'a.md'))).toBe(dirB);
    expect(await projectRootContaining(path.join(dirA, 'b.md'))).toBe(dirA);
    expect(await projectRootContaining(path.join(os.tmpdir(), 'elsewhere.md'))).toBeNull();
  });
});
