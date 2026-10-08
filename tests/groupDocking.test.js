import * as Y from 'yjs';
import {
  applyDock, undockWindow, pruneAfterRemoval, setSeam, reconcileTiles, resolveDockTarget,
  tileIndex, tiledMembers, layoutBarGeometry, zonePresetsFor, unionRect,
} from '../src/lib/layout/dock.js';
import { treeWindowIds, hiddenTabIds, removeWindow, splitAt, leaf } from '../src/lib/layout/tree.js';
import { solveLayout } from '../src/lib/layout/infer.js';
import { MIN_WINDOW_SIZE } from '../src/lib/windowSizeClasses.js';
import { GUTTER } from '../src/lib/layout/constants.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const win = (id, x, y, w = 480, h = 320) => ({ id, kind: 'doc', x, y, w, h, width: w, height: h });
let n = 0;
const makeGroup = () => ({ id: `g${++n}`, hue: 200 });
const byId = (state, id) => state.wins.find((w) => w.id === id);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function expectTiled(state, groupId) {
  const group = state.canvasGroups.find((g) => g.id === groupId);
  const members = tiledMembers(group, state.wins);
  expect(members).not.toBeNull();
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const hidden = hiddenTabIds(group.root);
      if (hidden.has(members[i].id) || hidden.has(members[j].id)) continue;
      expect(overlaps(members[i], members[j])).toBe(false);
    }
  }
  const outer = unionRect(members.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h })));
  expect(outer).toEqual({ x: group.x, y: group.y, w: group.w, h: group.h });
  return { group, members };
}

// Build the spec's demo: a 2x2 group made only by dragging.
function build2x2() {
  let state = { wins: [win('a', 0, 0), win('b', 900, 0), win('c', 0, 900), win('d', 900, 900)], canvasGroups: [] };
  state = applyDock(state, 'b', { kind: 'tile', targetId: 'a', groupId: null, side: 'right' }, { makeGroup });
  const gid = state.canvasGroups[0].id;
  state = applyDock(state, 'c', { kind: 'tile', targetId: 'a', groupId: gid, side: 'bottom' }, { makeGroup });
  state = applyDock(state, 'd', { kind: 'tile', targetId: 'b', groupId: gid, side: 'bottom' }, { makeGroup });
  return { state, gid };
}

describe('docking windows into groups', () => {
  test('dropping on the right edge of a loose window makes a two-tile group with a 2 px seam', () => {
    const state = applyDock(
      { wins: [win('a', 100, 100), win('b', 900, 600)], canvasGroups: [] },
      'b', { kind: 'tile', targetId: 'a', groupId: null, side: 'right' }, { makeGroup },
    );
    const { group } = expectTiled(state, state.canvasGroups[0].id);
    const a = byId(state, 'a');
    const b = byId(state, 'b');
    expect(a.x).toBe(100);
    expect(b.x - (a.x + a.w)).toBe(GUTTER);
    expect(b.y).toBe(a.y);
    expect(b.h).toBe(a.h);
    expect(a.groupId).toBe(group.id);
    expect(b.groupId).toBe(group.id);
  });

  test('a 2x2 group can be built by dragging alone', () => {
    const { state, gid } = build2x2();
    const { members } = expectTiled(state, gid);
    expect(members).toHaveLength(4);
    const xs = new Set(members.map((m) => m.x));
    const ys = new Set(members.map((m) => m.y));
    expect(xs.size).toBe(2);
    expect(ys.size).toBe(2);
    const { index } = tileIndex(state.wins, state.canvasGroups);
    expect(index.get('a').corners).toBe('tl');
    expect(index.get('b').corners).toBe('tr');
    expect(index.get('c').corners).toBe('bl');
    expect(index.get('d').corners).toBe('br');
  });

  test('dropping on a group edge adds a full-height column', () => {
    const { state, gid } = build2x2();
    const next = applyDock({ ...state, wins: [...state.wins, win('e', 3000, 0)] }, 'e', { kind: 'edge', groupId: gid, side: 'right' });
    const { members, group } = expectTiled(next, gid);
    const e = byId(next, 'e');
    expect(members).toHaveLength(5);
    expect(e.h).toBe(group.h);
    expect(e.x + e.w).toBe(group.x + group.w);
  });

  test('center drop stacks a window as a tab in that slot', () => {
    const { state, gid } = build2x2();
    const next = applyDock({ ...state, wins: [...state.wins, win('e', 3000, 0)] }, 'e', { kind: 'tile', targetId: 'a', groupId: gid, side: 'center' });
    const group = next.canvasGroups.find((g) => g.id === gid);
    expect([...hiddenTabIds(group.root)]).toEqual(['a']);
    const a = byId(next, 'a');
    const e = byId(next, 'e');
    expect([e.x, e.y, e.w, e.h]).toEqual([a.x, a.y, a.w, a.h]);
  });

  test('dropping on a layout-bar cell applies that layout with the window in that cell', () => {
    let state = { wins: [win('a', 0, 0), win('b', 0, 0), win('c', 2000, 0)], canvasGroups: [] };
    state = applyDock(state, 'b', { kind: 'tile', targetId: 'a', groupId: null, side: 'right' }, { makeGroup });
    const gid = state.canvasGroups[0].id;
    state = applyDock(state, 'c', { kind: 'preset', groupId: gid, presetId: 'ONE_PLUS_TWO', cell: 0 });
    const { group } = expectTiled(state, gid);
    const c = byId(state, 'c');
    expect(c.x).toBe(group.x);
    expect(c.h).toBe(group.h);
  });

  test('the layout bar offers 2-up, 3-column, 1+2, 2x2 and focus + sidebar by count', () => {
    expect(zonePresetsFor(2).map((p) => p.id)).toEqual(['TWO_UP', 'FOCUS_SIDEBAR']);
    expect(zonePresetsFor(3).map((p) => p.id)).toEqual(['THREE_COL', 'ONE_PLUS_TWO', 'FOCUS_SIDEBAR']);
    expect(zonePresetsFor(4).map((p) => p.id)).toEqual(['GRID_2X2', 'FOCUS_SIDEBAR']);
  });
});

describe('leaving and cleaning up groups', () => {
  test('pulling one window out re-tiles the rest to fill the group', () => {
    const { state, gid } = build2x2();
    const before = state.canvasGroups.find((g) => g.id === gid);
    const next = undockWindow(state, 'b');
    const { members, group } = expectTiled(next, gid);
    expect(members.map((m) => m.id).sort()).toEqual(['a', 'c', 'd']);
    expect(byId(next, 'b').groupId).toBeNull();
    expect([group.x, group.y, group.w, group.h]).toEqual([before.x, before.y, before.w, before.h]);
    expect(byId(next, 'd').y).toBe(group.y);
  });

  test('a group of one dissolves into a loose window', () => {
    let state = applyDock(
      { wins: [win('a', 0, 0), win('b', 900, 0)], canvasGroups: [] },
      'b', { kind: 'tile', targetId: 'a', groupId: null, side: 'right' }, { makeGroup },
    );
    state = undockWindow(state, 'b');
    expect(state.canvasGroups).toEqual([]);
    expect(byId(state, 'a').groupId).toBeNull();
  });

  test('closing every window removes the group', () => {
    const { state } = build2x2();
    let next = state;
    for (const id of ['a', 'b', 'c', 'd']) {
      const gone = next.wins.filter((w) => w.id === id);
      const kept = { ...next, wins: next.wins.filter((w) => w.id !== id) };
      next = pruneAfterRemoval(kept, gone) || kept;
    }
    expect(next.canvasGroups).toEqual([]);
  });

  test('a manual group (no layout tree) is left alone until it drops to one window', () => {
    const state = {
      wins: [win('a', 0, 0), win('b', 600, 0), win('c', 0, 600)].map((w) => ({ ...w, groupId: 'm' })),
      canvasGroups: [{ id: 'm', x: 0, y: 0, w: 1200, h: 1000, root: null }],
    };
    const gone = [state.wins[2]];
    expect(pruneAfterRemoval({ ...state, wins: state.wins.slice(0, 2) }, gone)).toBeNull();
    const after = pruneAfterRemoval({ ...state, wins: state.wins.slice(0, 1) }, state.wins.slice(1));
    expect(after.canvasGroups).toEqual([]);
    expect(after.wins[0].groupId).toBeNull();
  });
});

describe('seams', () => {
  test('dragging a seam resizes both neighbors in one update and respects the minimum size', () => {
    let state = applyDock(
      { wins: [win('a', 0, 0, 480, 320), win('b', 0, 0, 480, 320)], canvasGroups: [] },
      'b', { kind: 'tile', targetId: 'a', groupId: null, side: 'right' }, { makeGroup },
    );
    const gid = state.canvasGroups[0].id;
    const groupW = state.canvasGroups[0].w;
    state = setSeam(state, gid, '', 0.75);
    const a = byId(state, 'a');
    const b = byId(state, 'b');
    expect(a.w).toBeGreaterThan(b.w);
    expect(a.w + GUTTER + b.w).toBe(groupW);
    state = setSeam(state, gid, '', 0.99);
    expect(byId(state, 'b').w).toBe(MIN_WINDOW_SIZE.w);
    expectTiled(state, gid);
  });

  test('solveLayout reports one seam per split, sitting in the gap', () => {
    const root = splitAt(leaf('a'), 'a', 'b', 'right');
    const out = solveLayout(root, { x: 0, y: 0, w: 1002, h: 400 }, { snapBounds: false, gap: 2 });
    expect(out.splits).toHaveLength(1);
    const [a, b] = out.rects.map((r) => r.rect);
    expect(out.splits[0].seam).toEqual({ x: a.x + a.w, y: 0, w: 2, h: 400 });
    expect(b.x).toBe(a.x + a.w + 2);
  });
});

describe('drop targets', () => {
  const { state, gid } = build2x2();
  const g = state.canvasGroups.find((x) => x.id === gid);
  const a = byId(state, 'a');
  const extra = { ...state, wins: [...state.wins, win('e', 5000, 5000)] };

  test('the edges and center of a tile resolve to sides and a tab stack', () => {
    const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    expect(resolveDockTarget({ point: mid(a), draggedId: 'e', ...extra })).toMatchObject({ kind: 'tile', targetId: 'a', side: 'center' });
    expect(resolveDockTarget({ point: { x: a.x + a.w - 40, y: a.y + a.h / 2 }, draggedId: 'e', ...extra })).toMatchObject({ kind: 'tile', targetId: 'a', side: 'right' });
  });

  test('the outer band of a group resolves to a group edge', () => {
    expect(resolveDockTarget({ point: { x: g.x + 4, y: g.y + g.h / 2 }, draggedId: 'e', ...extra })).toMatchObject({ kind: 'edge', groupId: gid, side: 'left' });
  });

  test('the layout bar resolves to a preset cell', () => {
    const geo = layoutBarGeometry(g, 5, 1);
    const cell = geo.items[0].cells[1];
    const target = resolveDockTarget({ point: { x: cell.x + 2, y: cell.y + 2 }, draggedId: 'e', ...extra });
    expect(target).toMatchObject({ kind: 'preset', groupId: gid, cell: 1 });
  });

  test('open canvas is a free move', () => {
    expect(resolveDockTarget({ point: { x: -4000, y: -4000 }, draggedId: 'e', ...extra })).toBeNull();
  });
});

describe('two people at once', () => {
  // One person drags a seam while the other moves the group. The CRDT merges
  // field by field, so windows can end up with half of each change; every
  // client then runs reconcileTiles and they converge on the same layout.
  test('a seam drag and a group move merge into one consistent layout', () => {
    const { state, gid } = build2x2();
    const origin = new Y.Doc();
    writeStateToDoc(origin, null, state, 'local');
    const base = readDocState(origin, state);

    // Two people start from the same doc, edit while apart, then sync.
    const sA = setSeam(base, gid, '', 0.7);
    const g = base.canvasGroups.find((x) => x.id === gid);
    const sB = {
      wins: base.wins.map((w) => (w.groupId === gid ? { ...w, x: w.x + 500, y: w.y + 300 } : w)),
      canvasGroups: base.canvasGroups.map((x) => (x.id === gid ? { ...x, x: g.x + 500, y: g.y + 300 } : x)),
    };
    const isoA = new Y.Doc();
    const isoB = new Y.Doc();
    Y.applyUpdate(isoA, Y.encodeStateAsUpdate(origin));
    Y.applyUpdate(isoB, Y.encodeStateAsUpdate(origin));
    writeStateToDoc(isoA, base, sA, 'local');
    writeStateToDoc(isoB, base, sB, 'local');
    const fromA = Y.encodeStateAsUpdate(isoA);
    const fromB = Y.encodeStateAsUpdate(isoB);
    Y.applyUpdate(isoA, fromB);
    Y.applyUpdate(isoB, fromA);

    const mergedA = readDocState(isoA, base);
    const mergedB = readDocState(isoB, base);
    const fixedA = reconcileTiles(mergedA) || mergedA;
    const fixedB = reconcileTiles(mergedB) || mergedB;
    const pick = (s) => s.wins.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })).sort((p, q) => p.id.localeCompare(q.id));
    expect(pick(fixedA)).toEqual(pick(fixedB));
    const { group } = expectTiled(fixedA, gid);
    // Both edits survive: the group moved and the seam moved.
    expect(group.x).toBe(g.x + 500);
    expect(byId(fixedA, 'a').w).toBeGreaterThan(byId(fixedA, 'b').w);
    expect(reconcileTiles(fixedA)).toBeNull();
  });
});

describe('tree helpers', () => {
  test('removing the last window from a split collapses it', () => {
    const root = splitAt(leaf('a'), 'a', 'b', 'bottom');
    expect(removeWindow(root, 'b')).toEqual(leaf('a'));
    expect(treeWindowIds(removeWindow(removeWindow(root, 'a'), 'b'))).toEqual([]);
  });
});

describe('one-window groups', () => {
  test('reconcile keeps a one-window group (an F-key group made from one window)', () => {
    const state = {
      wins: [{ ...win('a', 0, 0), x: 10, groupId: 'solo' }],
      canvasGroups: [{ id: 'solo', x: 0, y: 0, w: 480, h: 320, root: leaf('a') }],
    };
    const next = reconcileTiles(state);
    expect(next.canvasGroups.map((g) => g.id)).toEqual(['solo']);
    expect(byId(next, 'a').x).toBe(0);
  });
});
