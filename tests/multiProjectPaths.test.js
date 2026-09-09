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

const openRoots = { current: [] };
jest.unstable_mockModule('../server/routes/projects/shared.js', () => ({
  readOpenProjects: async () => openRoots.current,
  registerOpenProject: jest.fn(),
}));

// Pin local-state reads to an isolated temp dir (CENSAI_STATE_DIR in
// pathUtils) BEFORE importing it: the suite must neither depend on nor
// clobber the checkout's real .homebase-state/current-project.json, which
// varies per machine and is absent from pruned trees like the public export.
const isolatedStateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'censai-mpp-state-'));
process.env.CENSAI_STATE_DIR = isolatedStateDir;

const { validateProjectPath } = await import('../server/routes/files/pathUtils.js');

// files/pathUtils.js reads the isolated current-project.json, so every run
// sees the same project root regardless of ambient developer state.
const stateFile = path.join(isolatedStateDir, 'current-project.json');
let dirA;
let dirB;

beforeAll(async () => {
  dirA = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proj-a-'));
  dirB = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'proj-b-'));
  await fs.promises.writeFile(stateFile, JSON.stringify({ path: dirA }), 'utf8');
});

afterAll(async () => {
  delete process.env.CENSAI_STATE_DIR;
  await fs.promises.rm(isolatedStateDir, { recursive: true, force: true });
  await fs.promises.rm(dirA, { recursive: true, force: true });
  await fs.promises.rm(dirB, { recursive: true, force: true });
});

describe('multi-project path validation', () => {
  test('allows paths inside the current project root', async () => {
    openRoots.current = [];
    await expect(validateProjectPath(path.join(dirA, 'src', 'app.js')))
      .resolves.toBe(path.join(dirA, 'src', 'app.js'));
  });

  test('allows paths inside a previously opened project root', async () => {
    openRoots.current = [dirB];
    await expect(validateProjectPath(path.join(dirB, 'notes.md')))
      .resolves.toBe(path.join(dirB, 'notes.md'));
  });

  test('still rejects paths outside every open root', async () => {
    openRoots.current = [dirB];
    await expect(validateProjectPath(path.join(os.tmpdir(), 'elsewhere', 'x.js')))
      .rejects.toThrow('Access denied');
  });
});
