import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Opening a folder by its path alone (window project menu, typed path in a
// file tree) used to fail with "Provide a project name or a repo".
const openProject = jest.fn(async (_owner, opts) => ({ id: 'p1', name: opts.name, path: opts.existingPath, owner_agent_id: 'architect' }));
jest.unstable_mockModule('../server/workspaces.js', () => ({ openProject, listProjects: jest.fn(async () => []) }));
const registered = [];
const real = await import('../server/routes/projects/shared.js');
jest.unstable_mockModule('../server/routes/projects/shared.js', () => ({
  ...real,
  registerOpenProject: jest.fn(async (p) => { registered.push(p); return registered; }),
}));
const { openProjectHandler } = await import('../server/routes/projects/core.js');

function respond() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('a folder opened by path alone is named after the folder and put on the board', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-by-path-'));
  const folder = path.join(dir, 'shop-site');
  fs.mkdirSync(folder);
  const res = respond();
  await openProjectHandler({ body: { path: folder } }, res);
  expect(res.statusCode).toBe(200);
  expect(openProject.mock.calls[0][1]).toMatchObject({ name: 'shop-site', existingPath: folder });
  expect(registered).toEqual([folder]);
});

test("censaiOS's own folder of keys and logins is never opened as a project", async () => {
  const { OWN_STATE_WORDS } = await import('../server/routes/files/ownState.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-by-path-'));
  const state = path.join(dir, '.homebase-state');
  fs.mkdirSync(path.join(state, 'made-up'), { recursive: true });
  const before = [...registered];
  for (const asked of [state, path.join(state, 'made-up')]) {
    const res = respond();
    await openProjectHandler({ body: { path: asked } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: OWN_STATE_WORDS });
  }
  expect(registered).toEqual(before);
});
