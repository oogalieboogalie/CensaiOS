// The test team's list of modules used to be one hand-kept file that every
// new module had to add a line to, so two teams adding a module at the same
// time both changed it and one had to wait. Now a module file in the folder
// is found by itself.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODULES, joinModules, pickModules } from '../scripts/test-team/modules/index.mjs';

const FOLDER = path.join(process.cwd(), 'scripts', 'test-team', 'modules');
const a = { id: 'a', label: 'A', run: async () => {} };
const b = { id: 'b', label: 'B', run: async () => {} };
const c = { id: 'c', label: 'C', run: async () => {} };

describe('the test team finds its modules by itself', () => {
  test('every module file in the folder is in the list, once', async () => {
    const names = fs.readdirSync(FOLDER).filter((n) => n.endsWith('.mjs') && n !== 'index.mjs');
    expect(names.length).toBeGreaterThan(100);
    let modules = 0;
    for (const name of names) {
      const mod = (await import(pathToFileURL(path.join(FOLDER, name)).href)).default;
      if (!mod) continue; // a helper file: shared steps, not a module
      modules += 1;
      expect(MODULES.filter((m) => m === mod)).toHaveLength(1);
      expect(pickModules(mod.id)).toEqual([mod]);
    }
    expect(MODULES).toHaveLength(modules);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
  });

  test('the listed modules keep their order, and a new file joins after them', () => {
    expect(joinModules([b, a], [a, b, c]).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  test('a helper file with no module in it is left out', () => {
    expect(joinModules([a], [undefined, null, {}, { id: 'x' }, { id: '', run() {} }, b])).toEqual([a, b]);
  });

  test('two modules with the same name stop the run and say which name', () => {
    expect(() => joinModules([a], [{ id: 'a', label: 'Another A', run: async () => {} }])).toThrow('two test-team modules are called "a"');
  });

  test('the index file no longer needs a line for a new module', () => {
    const index = fs.readFileSync(path.join(FOLDER, 'index.mjs'), 'utf8');
    expect(index).toContain('fs.readdirSync(HERE)');
  });
});
