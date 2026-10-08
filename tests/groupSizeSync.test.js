/** @jest-environment jsdom */
import { useWorkspaceStore } from '../src/lib/store.js';
import { canvasObjectToLegacyWindow, patchWindow } from '../src/lib/canvasObjectTypes.js';

// Regression: clicking a chat window inside a group snapped it back to its
// pre-group size and it looked un-grouped. Group layouts wrote `w`/`h` but
// left the canonical `width`/`height` stale, so the next ordinary update
// (a chat message, the active window's polling, a font tweak) rebuilt the
// window from the stale width/height.
const chat = (id, x, y) => canvasObjectToLegacyWindow({
  id, kind: 'chat', x, y, w: 380, h: 520, width: 380, height: 520,
});

describe('grouped window size stays put', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      wins: [chat('a', 100, 100), chat('b', 600, 100)],
      canvasGroups: [],
      selectedIds: [],
      activeId: null,
    });
  });

  test('an unrelated update after auto-arrange keeps the grouped size and membership', () => {
    const store = useWorkspaceStore.getState();
    const groupId = store.spawnGroup({ x: 0, y: 0 }, { w: 1200, h: 800 });
    useWorkspaceStore.getState().autoArrangeGroup(groupId, 'SPLIT_LR');

    const arranged = useWorkspaceStore.getState().wins.find((w) => w.id === 'a');
    expect(arranged.groupId).toBe(groupId);
    expect(arranged.width).toBe(arranged.w);
    expect(arranged.height).toBe(arranged.h);

    // What a chat window does when clicked / active: an update with no size.
    useWorkspaceStore.getState().onUpdate('a', { msgs: [{ from: 'me', text: 'hi' }] });
    const after = useWorkspaceStore.getState().wins.find((w) => w.id === 'a');
    expect(after.w).toBe(arranged.w);
    expect(after.h).toBe(arranged.h);
    expect(after.x).toBe(arranged.x);
    expect(after.groupId).toBe(groupId);
  });

  test('a group resize keeps width/height in step with w/h', () => {
    const groupId = useWorkspaceStore.getState().spawnGroup({ x: 0, y: 0 }, { w: 1200, h: 800 });
    useWorkspaceStore.getState().resizeGroup(groupId, {
      groupPatch: { w: 1600 },
      windowPatches: [{ id: 'a', patch: { w: 777, h: 555 } }],
    });
    useWorkspaceStore.getState().onUpdate('a', { fontScale: 1.1 });
    const a = useWorkspaceStore.getState().wins.find((w) => w.id === 'a');
    expect([a.w, a.h, a.width, a.height]).toEqual([777, 555, 777, 555]);
  });

  test('workspaces saved with stale width/height load at the rendered size', () => {
    const loaded = canvasObjectToLegacyWindow({ id: 'x', kind: 'chat', w: 640, h: 480, width: 380, height: 520 });
    expect([loaded.w, loaded.h, loaded.width, loaded.height]).toEqual([640, 480, 640, 480]);
  });

  test('patchWindow accepts either size spelling', () => {
    const base = { id: 'x', w: 100, h: 100, width: 100, height: 100 };
    expect(patchWindow(base, { width: 300 })).toMatchObject({ w: 300, width: 300, h: 100, height: 100 });
    expect(patchWindow(base, { h: 250 })).toMatchObject({ h: 250, height: 250 });
    expect(patchWindow(base, { title: 't' })).toMatchObject({ w: 100, width: 100 });
  });

  test('spawning with an explicit size uses it', () => {
    const id = useWorkspaceStore.getState().spawnAt('chat', { w: 640, h: 480 }, { x: 0, y: 0 });
    const win = useWorkspaceStore.getState().wins.find((w) => w.id === id);
    expect([win.w, win.h, win.width, win.height]).toEqual([640, 480, 640, 480]);
  });
});
