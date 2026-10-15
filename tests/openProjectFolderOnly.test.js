import { jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../server/github.js', () => ({ getRepoInfo: jest.fn() }));
jest.unstable_mockModule('../server/workspaces/briefs.js', () => ({ refreshProjectBrief: jest.fn() }));
jest.unstable_mockModule('../server/workspaces/activity.js', () => ({ logProjectActivity: jest.fn() }));

const { default: pool } = await import('../server/db.js');
const { openProject } = await import('../server/workspaces/projects.js');

describe('openProject with only a folder', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-open-'));
    fs.mkdirSync(path.join(dir, 'my-shop'));
    pool.query.mockReset();
    pool.query.mockImplementation(async (sql, params) => (
      /INSERT INTO projects/.test(sql)
        ? { rows: [{ id: params[0], name: params[2], path: params[3] }] }
        : { rows: [] }
    ));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('names the project after the folder', async () => {
    const project = await openProject('architect', { existingPath: path.join(dir, 'my-shop') });
    expect(project.name).toBe('my-shop');
    expect(project.id).toBe('shared-my-shop');
  });

  test('still refuses when nothing is given', async () => {
    await expect(openProject('architect', {})).rejects.toThrow(/name, a repo or a folder/);
  });
});
