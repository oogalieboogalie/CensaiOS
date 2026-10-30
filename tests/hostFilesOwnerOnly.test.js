import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Pretend people, never real ones: Pat owns this computer, Vic only looks at
// Pat's board, Mo can edit it, Sol only works on boards Sol made. Files in
// open projects belong to the computer, not to a board, so only Pat changes them.
const PEOPLE = {
  1: { role: 'admin' },
  2: { role: 'user' },
  3: { role: 'user' },
  4: { role: 'user' },
};
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-file-role-'));
process.env.CENSAI_STATE_DIR = stateDir;
// The made-up folder each test makes is the one project open on the board.
let dir;
let file;
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/workspaces/shared.js', () => ({
  getWorkspacesRoot: () => process.cwd(),
  mapProjectPathForRuntime: (p) => p,
  normalizeProjectPathForStorage: (p) => p,
  resolveProjectPathForRuntime: (p) => p,
}));
jest.unstable_mockModule('../server/routes/projects/shared.js', () => ({
  readOpenProjects: async () => (dir ? [dir] : []),
  registerOpenProject: jest.fn(),
}));

const { OWNER_ONLY_MESSAGE } = await import('../server/security/systemAdmin.js');
const { browserRouter } = await import('../server/routes/files/browser.js');
const { mkdirRouter } = await import('../server/routes/files/mkdir.js');

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', browserRouter, mkdirRouter);
  return a;
}

beforeEach(async () => {
  dir = await fs.promises.mkdtemp(path.join(process.cwd(), '.tmp-file-role-'));
  file = path.join(dir, 'notes.md');
  await fs.promises.writeFile(file, 'original', 'utf8');
});
afterEach(async () => { await fs.promises.rm(dir, { recursive: true, force: true }); });
afterAll(async () => {
  delete process.env.CENSAI_STATE_DIR;
  await fs.promises.rm(stateDir, { recursive: true, force: true });
});

describe.each([2, 3, 4])('teammate %p', (id) => {
  test('can still read a file', async () => {
    const res = await request(app(id)).get('/api/files/content').query({ path: file });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('original');
  });

  test('cannot overwrite a file', async () => {
    const res = await request(app(id)).put('/api/files/content').send({ path: file, content: 'changed' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(OWNER_ONLY_MESSAGE);
    expect(await fs.promises.readFile(file, 'utf8')).toBe('original');
  });

  test('cannot make a folder', async () => {
    const res = await request(app(id)).post('/api/files/mkdir').send({ path: dir, name: 'new' });
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(dir, 'new'))).toBe(false);
  });
});

describe("the computer's owner", () => {
  test('can save a file', async () => {
    const res = await request(app(1)).put('/api/files/content').send({ path: file, content: 'by Pat' });
    expect(res.status).toBe(200);
    expect(await fs.promises.readFile(file, 'utf8')).toBe('by Pat');
  });

  test('can make a folder', async () => {
    const res = await request(app(1)).post('/api/files/mkdir').send({ path: dir, name: 'new' });
    expect(res.status).toBe(200);
  });
});
