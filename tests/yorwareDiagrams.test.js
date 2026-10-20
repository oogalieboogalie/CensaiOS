// YorWare Diagrams: how a drawing lives on the board, how two people's
// shapes merge, file import, and where the fonts are served from.
import path from 'path';
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  MAX_ELEMENTS, boardIsAhead, elementKey, elementsPatch, filesPatch, isNewer, liveElements, readDiagram,
  reconcile, rememberBoard, scenePatch,
} from '../src/lib/yorware/diagramModel.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { resolveExcalidrawAsset } from '../server/boot/excalidrawAssets.js';

let n = 0;
const shape = (id, fields = {}) => ({
  id, type: 'rectangle', x: 0, y: 0, width: 100, height: 60, version: 1, versionNonce: 500, index: `a${n++}`, isDeleted: false, ...fields,
});
const winWith = (...els) => {
  const win = { kind: 'yorDiagrams', ...YORWARE_STARTERS.yorDiagrams };
  for (const el of els) win[elementKey(el.id)] = el;
  return win;
};

describe('YorWare Diagrams board model', () => {
  test('a new window starts empty and reads shapes back in drawing order', () => {
    expect(readDiagram({ ...YORWARE_STARTERS.yorDiagrams }).elements).toEqual([]);
    const win = winWith(shape('b', { index: 'a2' }), shape('a', { index: 'a1' }), { id: 'bad.id', type: 'x' });
    expect(readDiagram(win).elements.map((e) => e.id)).toEqual(['a', 'b']);
  });

  test('the higher version wins; a tie goes to the lower nonce', () => {
    expect(isNewer(shape('a', { version: 3 }), shape('a', { version: 2 }))).toBe(true);
    expect(isNewer(shape('a', { version: 2, versionNonce: 10 }), shape('a', { version: 2, versionNonce: 20 }))).toBe(true);
    expect(isNewer(shape('a', { version: 2, versionNonce: 20 }), shape('a', { version: 2, versionNonce: 10 }))).toBe(false);
    expect(isNewer(shape('a'), undefined)).toBe(true);
  });

  test('only what changed is written, and never twice', () => {
    const known = new Map();
    const a = shape('a');
    const b = shape('b');
    const first = elementsPatch([a, b], known);
    expect(Object.keys(first.patch).sort()).toEqual(['de.a', 'de.b']);
    expect(elementsPatch([a, b], known).count).toBe(0);
    const moved = { ...a, x: 40, version: 2, versionNonce: 7 };
    expect(Object.keys(elementsPatch([moved, b], known).patch)).toEqual(['de.a']);
  });

  test("what came from the board isn't written back", () => {
    const known = new Map();
    const board = [shape('a', { version: 4 })];
    rememberBoard(known, board);
    expect(elementsPatch(board, known).count).toBe(0);
    // An older copy on this screen doesn't overwrite the board either.
    expect(elementsPatch([{ ...board[0], version: 3 }], known).count).toBe(0);
  });

  test('merging a screen with the board keeps the newest copy of each shape', () => {
    const local = [shape('a', { version: 5, x: 50 }), shape('b', { version: 1 })];
    const board = [shape('a', { version: 4, x: 10 }), shape('b', { version: 2, x: 99 }), shape('c')];
    expect(boardIsAhead(local, board)).toBe(true);
    const merged = reconcile(local, board);
    expect(Object.fromEntries(merged.map((e) => [e.id, e.x]))).toEqual({ a: 50, b: 99, c: 0 });
    expect(boardIsAhead(merged, board)).toBe(false);
  });

  test('a removed shape stays removed when an older copy arrives', () => {
    const gone = shape('a', { version: 3, isDeleted: true });
    const merged = reconcile([gone], [shape('a', { version: 2 })]);
    expect(liveElements(merged)).toEqual([]);
    const { patch } = elementsPatch([gone], new Map());
    expect(patch['de.a']).toMatchObject({ isDeleted: true, version: 3, width: 100 });
  });

  test('two people drawing at once both keep their shapes', () => {
    const start = winWith(shape('box', { x: 0 }));
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [{ id: 'w1', x: 0, y: 0, w: 900, h: 700, ...start }] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const edit = (d, patch) => writeStateToDoc(d, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
    // Alma moves the box and draws an arrow; Sam writes a label at the same moment.
    edit(a, elementsPatch([shape('box', { x: 200, version: 2, versionNonce: 1 }), shape('arrow', { type: 'arrow' })], new Map()).patch);
    edit(b, elementsPatch([shape('label', { type: 'text', text: 'Launch' })], new Map()).patch);
    sync();
    for (const d of [a, b]) {
      const els = readDiagram(readDocState(d).wins[0]).elements;
      expect(els.map((e) => e.id).sort()).toEqual(['arrow', 'box', 'label']);
      expect(els.find((e) => e.id === 'box').x).toBe(200);
    }
  });

  test('opening a file replaces the drawing so every screen follows', () => {
    const old = shape('old', { version: 6 });
    const win = winWith(old, shape('same', { version: 9 }));
    const patch = scenePatch(win, {
      elements: [shape('same', { version: 1, x: 5 }), shape('fresh'), shape('dropped', { isDeleted: true })],
      files: { img1: { mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA' } },
      background: '#fff8e7',
    });
    expect(patch['de.old']).toMatchObject({ isDeleted: true, version: 7 });
    // A screen still holding the old shapes takes the file's version.
    expect(isNewer(patch['de.same'], shape('same', { version: 9 }))).toBe(true);
    expect(patch['de.dropped']).toBeUndefined();
    expect(patch['dfl.img1']).toMatchObject({ mimeType: 'image/png' });
    expect(patch.dgBg).toBe('#fff8e7');
    const after = readDiagram({ ...win, ...patch });
    expect(liveElements(after.elements).map((e) => e.id).sort()).toEqual(['fresh', 'same']);
  });

  test('limits: very big drawings and pictures', () => {
    const many = Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => shape(`s${i}`));
    expect(() => scenePatch({}, { elements: many })).toThrow(/holds up to/);
    const big = { mimeType: 'image/png', dataURL: `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}` };
    const small = { mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA' };
    const res = filesPatch({ big, small, onBoard: small }, { onBoard: small });
    expect(res.tooBig).toEqual(['big']);
    expect(Object.keys(res.patch)).toEqual(['dfl.small']);
  });
});

describe('YorWare Diagrams window', () => {
  test('is registered as a built-in window', () => {
    const m = WINDOW_MANIFESTS.find((w) => w.kind === 'yorDiagrams');
    expect(m).toMatchObject({ label: 'Diagrams', componentName: 'YorDiagramsWindow' });
  });

  test('its fonts are served from censaiOS, not someone else\'s server', () => {
    const root = path.resolve('.');
    expect(resolveExcalidrawAsset(root, '/vendor/excalidraw/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2')).toMatch(/Excalifont/);
    expect(resolveExcalidrawAsset(root, '/vendor/excalidraw/fonts/../../index.js')).toBeNull();
    expect(resolveExcalidrawAsset(root, '/vendor/excalidraw/fonts/Xiaolai/x.woff2')).toBeNull();
    expect(resolveExcalidrawAsset(root, '/somewhere/else.woff2')).toBeNull();
  });
});
