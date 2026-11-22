import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveInsideProject } from '../server/workspaces/shared.js';
import { projectList } from '../server/workspaces/projects.js';

// An agent that asks for "/" means the top of the project. It used to be refused as
// "Path escapes project root", so the first listing failed and only a retry without a path worked.
describe('a path that starts with a slash is read from the top of the project', () => {
  let root;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-project-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'shop.js'), '');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  test('"/" is the project folder and "/src" is its src folder', () => {
    expect(resolveInsideProject(root, '/')).toBe(root);
    expect(resolveInsideProject(root, '/src')).toBe(path.join(root, 'src'));
  });

  test('the project\'s own full path still works', () => {
    expect(resolveInsideProject(root, path.join(root, 'src'))).toBe(path.join(root, 'src'));
  });

  test('listing "/" lists the project', async () => {
    expect(await projectList({ path: root }, '/')).toEqual([{ name: 'src', type: 'dir' }]);
  });

  test('a path that climbs out is still refused', () => {
    expect(() => resolveInsideProject(root, '../other')).toThrow(/escapes project root/);
    expect(() => resolveInsideProject(root, '/../other')).toThrow(/escapes project root/);
    expect(() => resolveInsideProject(root, 'src/../../other')).toThrow(/escapes project root/);
  });
});
