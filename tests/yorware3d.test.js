// YorWare 3D Viewer (spec 13): models, how each one shows, the shared look
// and pinned notes live in their own board fields so two people's changes
// merge; file grouping, placement and measuring are plain functions; STL,
// OBJ (with its .mtl) and PLY files open through the three.js loaders.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  MAX_MODELS, MAX_MODEL_BYTES, addModelsPatch, addNotePatch, editNotePatch, readScene, removeModelPatch, removeNotePatch, showPatch, viewPatch,
} from '../src/lib/yorware/modelBoard.js';
import { groupModelFiles, isModelName, modelTitle, readModel } from '../src/lib/yorware/modelFiles.js';
import { arrangeOffsets, countObject, measureLength, niceNumber, sameSizeScale, sizeText, standBox, statsLine } from '../src/lib/yorware/modelMeasure.js';
import { loadModel } from '../src/lib/yorware/modelLoad.js';
import { bytesToBase64 } from '../src/lib/yorware/pdfBytes.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const item = (name, format = 'glb', bytes = 1000) => ({ name, format, main: `${name}.${format}`, files: { [`${name}.${format}`]: 'AA' }, bytes });
function sceneWith(...items) {
  const start = { kind: 'yor3d', ...YORWARE_STARTERS.yor3d };
  const { patch } = addModelsPatch(readScene(start), items);
  return { ...start, ...patch };
}
const apply = (win, patch) => ({ ...win, ...patch });
const file = (name, text) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer });

// A 20 x 10 x 5 box as ASCII STL (12 triangles), Z up like a printer file.
function boxStl(w = 20, d = 10, h = 5) {
  const v = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]];
  const tris = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const facets = tris.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${v[i].join(' ')}`).join('\n')}\nendloop\nendfacet`);
  return `solid box\n${facets.join('\n')}\nendsolid box\n`;
}

describe('YorWare 3D Viewer board model', () => {
  test('adding models appends them; printer formats start stood up with Z up', () => {
    const win = sceneWith(item('rocket'), item('bracket', 'stl'));
    const scene = readScene(win);
    expect(scene.order).toHaveLength(2);
    expect(scene.show[scene.order[0]]).toEqual({ visible: true, zUp: false, color: null });
    expect(scene.show[scene.order[1]].zUp).toBe(true);
    expect(scene.view).toEqual({ shading: 'solid', grid: true, arrange: 'side' });
    expect(scene.bytes).toBe(2000);
  });

  test('the viewer stops at the model limit and refuses files over 10 MB', () => {
    const full = sceneWith(...Array.from({ length: MAX_MODELS - 1 }, (_, i) => item(`m${i}`)));
    const res = addModelsPatch(readScene(full), [item('huge', 'glb', MAX_MODEL_BYTES + 1), item('x'), item('y')]);
    expect(res.ids).toHaveLength(1);
    expect(res.tooBig).toEqual(['huge']);
    expect(res.skipped).toBe(1);
  });

  test('show and view settings are kept to known values', () => {
    const win = sceneWith(item('a'));
    const scene = readScene(win);
    const id = scene.order[0];
    const next = readScene(apply(win, { ...showPatch(scene, id, { visible: false, color: '#E5A83A' }), ...viewPatch(scene, { shading: 'nope', grid: false, arrange: 'same' }) }));
    expect(next.show[id]).toEqual({ visible: false, zUp: false, color: '#e5a83a' });
    expect(next.view).toEqual({ shading: 'solid', grid: false, arrange: 'same' });
    expect(readScene(apply(win, showPatch(scene, id, { color: 'red' }))).show[id].color).toBeNull();
  });

  test('notes pin to a model, can be edited, and go when the model goes', () => {
    let win = sceneWith(item('a'), item('b'));
    const [a, b] = readScene(win).order;
    const n1 = addNotePatch({ model: a, p: [1, 2, 3], text: 'Too thin here', by: 'Alma' }, 10);
    const n2 = addNotePatch({ model: b, p: [0, 0, 0], text: '' }, 20);
    win = apply(apply(win, n1.patch), n2.patch);
    let scene = readScene(win);
    expect(scene.noteOrder).toEqual([n1.id, n2.id]);
    expect(scene.notes[n1.id]).toMatchObject({ model: a, p: [1, 2, 3], text: 'Too thin here', by: 'Alma' });
    win = apply(win, editNotePatch(scene, n2.id, 'x'.repeat(400)));
    expect(readScene(win).notes[n2.id].text).toHaveLength(280);
    scene = readScene(win);
    win = apply(win, removeModelPatch(scene, a));
    scene = readScene(win);
    expect(scene.order).toEqual([b]);
    expect(scene.noteOrder).toEqual([n2.id]);
    expect(readScene(apply(win, removeNotePatch(n2.id))).noteOrder).toEqual([]);
    expect(addNotePatch({ model: a, p: null }).id).toBeNull();
  });

  test('two people at once: one hides a model and changes the look, the other pins a note; both keep their change', () => {
    const start = sceneWith(item('a'), item('b'));
    const [a, b] = readScene(start).order;
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)), 'remote');
      Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)), 'remote');
    };
    const base = { wins: [{ id: 'w1', x: 0, y: 0, w: 1080, h: 720, ...start }] };
    writeStateToDoc(docA, null, base, 'local');
    sync();
    const edit = (d, patch) => writeStateToDoc(d, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
    const scene = readScene(start);
    edit(docA, { ...showPatch(scene, a, { visible: false }), ...viewPatch(scene, { shading: 'clay' }) });
    const note = addNotePatch({ model: b, p: [0, 1, 0], text: 'Check this edge', by: 'Sam' });
    edit(docB, { ...note.patch, ...showPatch(scene, b, { color: '#336699' }) });
    sync();
    for (const d of [docA, docB]) {
      const s = readScene(readDocState(d).wins[0]);
      expect(s.show[a].visible).toBe(false);
      expect(s.show[b].color).toBe('#336699');
      expect(s.view.shading).toBe('clay');
      expect(s.notes[note.id].text).toBe('Check this edge');
    }
  });

  test('3D Viewer is in the YorWare Suite section of the Add palette', () => {
    const suite = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'YorWare Suite');
    expect(suite.items.map((i) => i.id)).toContain('kind:yor3d');
  });
});

describe('YorWare 3D Viewer files', () => {
  test('an .obj takes the .mtl and pictures dropped with it; stray files are skipped', () => {
    const { models, skipped } = groupModelFiles([{ name: 'chair.obj' }, { name: 'chair.mtl' }, { name: 'wood.jpg' }, { name: 'part.STL' }, { name: 'notes.txt' }]);
    expect(models.map((m) => [m.main.name, m.format, m.helpers.map((h) => h.name)])).toEqual([
      ['chair.obj', 'obj', ['chair.mtl', 'wood.jpg']], ['part.STL', 'stl', []],
    ]);
    expect(skipped).toEqual(['notes.txt']);
    expect(groupModelFiles([{ name: 'a.mtl' }]).skipped).toEqual(['a.mtl']);
    expect(isModelName('x.3mf')).toBe(true);
    expect(modelTitle('C:\\parts\\gear v2.glb')).toBe('gear v2');
  });

  test('reading a model keeps every file as base64 and adds up the bytes', async () => {
    const m = await readModel({ main: file('t.obj', 'v 0 0 0'), format: 'obj', helpers: [file('t.mtl', 'newmtl a')] });
    expect(m).toMatchObject({ name: 't', format: 'obj', main: 't.obj', bytes: 15 });
    expect(Object.keys(m.files)).toEqual(['t.obj', 't.mtl']);
  });
});

describe('YorWare 3D Viewer opening files', () => {
  const stored = (name, format, files, main) => ({ name, format, main, files, bytes: 1 });
  test('an STL opens as one mesh with its true size', async () => {
    const obj = await loadModel(stored('box', 'stl', { 'box.stl': bytesToBase64(new TextEncoder().encode(boxStl())) }, 'box.stl'));
    expect(countObject(obj)).toMatchObject({ meshes: 1, triangles: 12 });
    expect(sizeText(obj.userData.box)).toBe('20 × 5 × 10');
    // Stood up (Z up), the 5 mm is the height.
    expect(sizeText(standBox(obj.userData.box, true))).toBe('20 × 10 × 5');
  });

  test('an OBJ takes the colours from its .mtl', async () => {
    const objText = 'mtllib t.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl red\nf 1 2 3\n';
    const obj = await loadModel(stored('t', 'obj', {
      't.obj': bytesToBase64(new TextEncoder().encode(objText)),
      't.mtl': bytesToBase64(new TextEncoder().encode('newmtl red\nKd 1 0 0\n')),
    }, 't.obj'));
    const meshes = [];
    obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].material.name).toBe('red');
    expect(meshes[0].material.color.r).toBeCloseTo(1);
  });

  test('a PLY with no faces opens as a point cloud', async () => {
    const ply = 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 0 0\n0 1 0\n';
    const obj = await loadModel(stored('scan', 'ply', { 'scan.ply': bytesToBase64(new TextEncoder().encode(ply)) }, 'scan.ply'));
    expect(countObject(obj)).toMatchObject({ points: 3, meshes: 0 });
    expect(statsLine(countObject(obj))).toBe('3 points');
  });

  test('a broken file says which file could not be opened', async () => {
    await expect(loadModel(stored('bad', 'glb', { 'bad.glb': bytesToBase64(new Uint8Array([1, 2, 3])) }, 'bad.glb'))).rejects.toThrow(/bad\.glb/);
  });
});

describe('YorWare 3D Viewer placement and measuring', () => {
  const box = (min, max) => ({ min, max });
  test('side by side puts models in a row on the floor with a gap', () => {
    const boxes = [box([0, 0, 0], [2, 2, 2]), box([-1, -1, -1], [1, 3, 1])];
    const offs = arrangeOffsets(boxes, 'side');
    const firstRight = boxes[0].max[0] + offs[0][0];
    const secondLeft = boxes[1].min[0] + offs[1][0];
    expect(secondLeft - firstRight).toBeCloseTo(0.6);
    expect(offs[0][1] + 0).toBe(0);
    expect(offs[1][1]).toBe(1);
  });

  test('as made keeps models where they are relative to each other', () => {
    const offs = arrangeOffsets([box([0, 5, 0], [2, 6, 2]), box([4, 7, 0], [6, 9, 2]), null], 'asMade');
    expect(offs[0]).toEqual(offs[1]);
    expect(offs[0]).toEqual([-3, -5, -1]);
  });

  test('same size scales the biggest side to one', () => {
    expect(sameSizeScale(box([0, 0, 0], [200, 50, 10]))).toBeCloseTo(0.005);
    expect(sameSizeScale(null)).toBe(1);
  });

  test('measuring on one model uses its own units, whatever the scene scale', () => {
    const a = { id: 'm', local: [0, 0, 0], world: [0, 0, 0] };
    const b = { id: 'm', local: [30, 40, 0], world: [0.3, 0.4, 0] };
    expect(measureLength(a, b)).toBe(50);
    expect(measureLength(a, { ...b, id: 'n' })).toBeCloseTo(0.5);
    expect(niceNumber(1234.5)).toBe('1,235');
    expect(niceNumber(0.012345)).toBe('0.0123');
    expect(niceNumber(12.345)).toBe('12.3');
  });
});
