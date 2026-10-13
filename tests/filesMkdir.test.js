import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

// Isolate local-state reads (current-project.json) from ambient developer
// state: pathUtils resolves LOCAL_STATE_DIR at import time, so pin it to a
// fresh temp dir BEFORE the deferred router imports below. Without this, a
// lived-in checkout whose open project prefixes the repo root makes
// validateProjectPath resolve test parents to nonexistent doubled paths
// (500s instead of 200/409).
const isolatedStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-mkdir-state-'));
process.env.CENSAI_STATE_DIR = isolatedStateDir;

// Isolate from ambient developer state: the route scopes parents to the open
// project (.homebase-state/current-project.json), which may point anywhere on
// a lived-in checkout. These tests pin mkdir behavior, not project scoping,
// so resolve every project path to the repo root like a project-less
// checkout would. NOTE: plain-object factory on purpose — an async factory
// that re-imports the mocked module OOMs the worker in this repo's setup.
jest.unstable_mockModule('../server/workspaces/shared.js', () => ({
  getWorkspacesRoot: () => process.cwd(),
  mapProjectPathForRuntime: (p) => p,
  normalizeProjectPathForStorage: (p) => p,
  resolveProjectPathForRuntime: () => process.cwd(),
}));

jest.unstable_mockModule('../server/routes/projects/shared.js', () => ({
  readOpenProjects: async () => [],
  registerOpenProject: jest.fn(),
}));

const { mkdirRouter } = await import('../server/routes/files/mkdir.js');
const { validateEntryName } = await import('../server/routes/files/mkdir.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api', mkdirRouter);
  return a;
}

afterAll(async () => {
  delete process.env.CENSAI_STATE_DIR;
  await fs.promises.rm(isolatedStateDir, { recursive: true, force: true });
});

describe('validateEntryName', () => {
  test.each([
    ['my-project', true],
    ['  spaced  ', true],
    ['', false],
    ['..', false],
    ['a/b', false],
    ['a\\b', false],
    ['x'.repeat(101), false],
    ['...', true],
  ])('name %p valid=%p', (name, valid) => {
    expect(validateEntryName(name).ok).toBe(valid);
  });
});

describe('POST /api/files/mkdir', () => {
  let parent;
  const created = [];

  beforeEach(async () => {
    parent = await fs.promises.mkdtemp(path.join(process.cwd(), '.tmp-mkdir-test-'));
  });

  afterEach(async () => {
    for (const dir of created.splice(0)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
    await fs.promises.rm(parent, { recursive: true, force: true });
  });

  test('creates a subfolder inside the allowed root', async () => {
    const res = await request(app())
      .post('/api/files/mkdir')
      .send({ path: parent, name: 'new-proj' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('new-proj');
    created.push(res.body.path);
    expect(fs.existsSync(res.body.path)).toBe(true);
  });

  test('rejects traversal names and outside-root parents', async () => {
    const badName = await request(app())
      .post('/api/files/mkdir')
      .send({ path: parent, name: '../escape' });
    expect(badName.status).toBe(400);

    const outside = await request(app())
      .post('/api/files/mkdir')
      .send({ path: os.tmpdir(), name: 'nope' });
    expect(outside.status).toBe(403);
  });

  test('409 when the folder already exists', async () => {
    const first = await request(app())
      .post('/api/files/mkdir')
      .send({ path: parent, name: 'dup' });
    expect(first.status).toBe(200);
    created.push(first.body.path);
    const second = await request(app())
      .post('/api/files/mkdir')
      .send({ path: parent, name: 'dup' });
    expect(second.status).toBe(409);
  });
});
