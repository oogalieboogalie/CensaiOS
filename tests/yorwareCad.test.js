// YorWare CAD: how a part lives on the board, the ready-made parts, and
// building them with the real OpenCascade kernel into STL and STEP files.
import * as Y from 'yjs';
import opencascade from 'replicad-opencascadejs';
import * as replicad from 'replicad';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  codePatch, paramKey, paramPatch, readCad, recipeHash, resetPatch, runPatch, sizeText, volumeText,
} from '../src/lib/yorware/cadModel.js';
import { CAD_RECIPES, recipeById } from '../src/lib/yorware/cadRecipes.js';
import { bodiesOf, compileRecipe, errorText, exportBodies, meshBodies, paramSpecs, paramValues, runRecipe } from '../src/lib/yorware/cadRun.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';

let oc;
beforeAll(async () => {
  oc = await opencascade({ print: () => {} });
  replicad.setOC(oc);
}, 60000);

const cadWin = (fields = {}) => ({ id: 'cad-1', kind: 'yorCad', ...YORWARE_STARTERS.yorCad, ...fields });

describe('YorWare CAD board model', () => {
  test('a new window has no recipe; a recipe and sizes read back', () => {
    expect(readCad(cadWin())).toEqual({ code: '', values: {}, run: null });
    const win = cadWin({ ...codePatch(recipeById('bracket').code), ...paramPatch('width', 60), ...paramPatch('cable', true), 'cp.bad.name': 1, 'cp.gone': null });
    const board = readCad(win);
    expect(board.code).toContain('function main');
    expect(board.values).toEqual({ width: 60, cable: true });
  });

  test('sizes are their own fields, so two people turning different dials both land', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [{ x: 0, y: 0, w: 1120, h: 720, ...cadWin(codePatch(recipeById('flange').code)) }] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const edit = (d, patch) => writeStateToDoc(d, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
    edit(a, paramPatch('outer', 150));
    edit(b, paramPatch('bolts', 8));
    sync();
    for (const doc of [a, b]) expect(readCad(readDocState(doc).wins[0]).values).toEqual({ outer: 150, bolts: 8 });
  });

  test('bad sizes and oversized recipes are refused; reset clears every size', () => {
    expect(() => paramPatch('a.b', 1)).toThrow();
    expect(() => paramPatch('width', { x: 1 })).toThrow();
    expect(() => codePatch('x'.repeat(20001))).toThrow(/at most/);
    expect(resetPatch({ width: 60, holes: 3 })).toEqual({ [paramKey('width')]: null, [paramKey('holes')]: null });
  });

  test('the build record is written once per recipe and sizes', () => {
    const hash = recipeHash('code', { a: 1 });
    expect(recipeHash('code', { a: 1 })).toBe(hash);
    expect(recipeHash('code', { a: 2 })).not.toBe(hash);
    const ok = { ok: true, size: [10, 20, 30.123], volume: 1234.56, bodies: [{ name: 'Box' }] };
    const patch = runPatch({ run: null }, ok, hash);
    expect(patch.cadRun).toMatchObject({ ok: true, size: [10, 20, 30.12], volume: 1234.6, bodies: ['Box'], hash });
    expect(runPatch({ run: patch.cadRun }, ok, hash)).toBeNull();
    expect(runPatch({ run: patch.cadRun }, { ok: false, error: 'boom' }, hash).cadRun).toMatchObject({ ok: false, error: 'boom' });
    expect(sizeText([80, 40, 30])).toBe('80 × 40 × 30 mm');
    expect(volumeText(23282)).toBe('23.3 cm³');
  });

  test('the Add palette lists CAD under YorWare Suite and a new window starts empty', () => {
    const suite = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'YorWare Suite');
    expect(suite.items.map((i) => i.id)).toContain('kind:yorCad');
    expect(YORWARE_STARTERS.yorCad).toEqual({ title: 'Untitled part' });
  });
});

describe('YorWare CAD recipes', () => {
  test('params become dials, kept inside their range', () => {
    const specs = paramSpecs({ w: { value: 10, min: 5, max: 20 }, on: true, kind: { value: 'b', options: ['a', 'b'] }, 'bad.name': 3, junk: 'x' });
    expect(specs.map((s) => [s.name, s.kind])).toEqual([['w', 'number'], ['on', 'toggle'], ['kind', 'choice']]);
    expect(paramValues(specs, { w: 99, on: false, kind: 'zzz' })).toEqual({ w: 20, on: false, kind: 'b' });
  });

  test('a recipe without main, or returning nothing, says what is missing', () => {
    expect(() => compileRecipe('const params = {};')).toThrow(/main/);
    expect(() => compileRecipe('function main( {')).toThrow(SyntaxError);
    expect(() => bodiesOf(42)).toThrow(/returned nothing/);
  });

  test.each(CAD_RECIPES.map((r) => [r.id]))('ready-made part %s builds, meshes and exports', async (id) => {
    const { specs, values, bodies } = runRecipe(replicad, recipeById(id).code, {});
    expect(specs.length).toBeGreaterThan(0);
    expect(Object.keys(values)).toEqual(specs.map((s) => s.name));
    const m = meshBodies(replicad, bodies);
    expect(m.volume).toBeGreaterThan(100);
    expect(m.size.every((n) => n > 1)).toBe(true);
    for (const mesh of m.meshes) {
      expect(mesh.triangles.length % 3).toBe(0);
      expect(mesh.edges.length).toBeGreaterThan(0);
    }
    const stl = await exportBodies(replicad, bodies, 'stl');
    const triangles = new DataView(stl.buffer).getUint32(80, true);
    expect(stl.length).toBe(84 + triangles * 50);
  }, 60000);

  test('sizes change the part: a wider block is wider', () => {
    const code = recipeById('blank').code;
    const at = (width) => meshBodies(replicad, runRecipe(replicad, code, { width }).bodies).size[0];
    expect(at(40)).toBeCloseTo(40, 3);
    expect(at(120)).toBeCloseTo(120, 3);
  }, 60000);

  test('STEP keeps every body with its name', async () => {
    const { bodies } = runRecipe(replicad, recipeById('projectBox').code, {});
    expect(bodies.map((b) => b.name)).toEqual(['Box', 'Lid']);
    const text = new TextDecoder().decode(await exportBodies(replicad, bodies, 'step'));
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain("'Box'");
    expect(text).toContain("'Lid'");
  }, 60000);

  test('a step the kernel refuses comes back as words', () => {
    let caught;
    try {
      runRecipe(replicad, 'function main(r) { return r.drawRoundedRectangle(60, 40, 5).sketchOnPlane().extrude(10).fillet(2, (e) => e.inDirection("Z")); }');
    } catch (err) { caught = err; }
    expect(caught).toBeDefined();
    expect(errorText(caught, oc)).toMatch(/kernel|fillet/i);
  }, 60000);
});
