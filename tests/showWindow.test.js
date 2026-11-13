/**
 * @jest-environment jsdom
 */
import { waitFor } from '@testing-library/react';
import { glideToWindow, revealWindow } from '../src/lib/showWindow.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { visibleCanvasRect } from '../src/lib/freeSpot.js';

// Bringing an open window forward (from Files, the Finder or Recents) glides
// the board just far enough that the whole window is on screen.

const view = () => {
  const { pan, zoom } = useWorkspaceStore.getState();
  return visibleCanvasRect({ pan, zoom, width: window.innerWidth, height: window.innerHeight });
};
const inView = (win, v = view()) => win.x >= v.x && win.y >= v.y && win.x + win.w <= v.x + v.w && win.y + win.h <= v.y + v.h;

beforeEach(() => {
  useWorkspaceStore.setState({ pan: { x: 0, y: 0 }, zoom: 1 });
});

test('a window past the edge of the screen: the board glides just far enough to show all of it', async () => {
  const win = { id: 'made-up-doc', x: 2400, y: 900, w: 520, h: 250 };
  expect(inView(win)).toBe(false);
  glideToWindow(win);
  await waitFor(() => expect(inView(win)).toBe(true));
  const v = view();
  expect(Math.round(v.x + v.w)).toBe(win.x + win.w);
  expect(Math.round(v.y + v.h)).toBe(win.y + win.h);
});

test('zoomed out, the board still lands with the whole window in view', async () => {
  useWorkspaceStore.setState({ pan: { x: 0, y: 0 }, zoom: 0.5 });
  const win = { id: 'made-up-doc', x: -1800, y: -600, w: 520, h: 250 };
  glideToWindow(win);
  await waitFor(() => expect(inView(win)).toBe(true));
  expect(useWorkspaceStore.getState().zoom).toBe(0.5);
});

test('a window already on screen leaves the board where it is', () => {
  glideToWindow({ id: 'made-up-doc', x: 100, y: 100, w: 300, h: 200 });
  expect(useWorkspaceStore.getState().pan).toEqual({ x: 0, y: 0 });
});

test('a pinned or full-screen window is on screen wherever the board is, so the board stays put', async () => {
  glideToWindow({ id: 'made-up-pinned', x: 5000, y: 5000, w: 300, h: 200, pinned: true });
  glideToWindow({ id: 'made-up-full', x: 5000, y: 5000, w: 300, h: 200, maximized: true });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(useWorkspaceStore.getState().pan).toEqual({ x: 0, y: 0 });
});

describe('revealing a window someone asked for', () => {
  const doc = (id, extra = {}) => ({ id, kind: 'doc', x: 100, y: 100, w: 300, h: 200, ...extra });
  afterEach(() => useWorkspaceStore.setState({ wins: [], canvasGroups: [], groupFocus: null }));

  test('a window behind another tab in its slot comes to the front of it', () => {
    const root = { type: 'leaf', windowId: 'made-up-front', stack: ['made-up-front', 'made-up-behind'] };
    useWorkspaceStore.setState({
      wins: [doc('made-up-front', { groupId: 'made-up-group' }), doc('made-up-behind', { groupId: 'made-up-group' })],
      canvasGroups: [{ id: 'made-up-group', x: 100, y: 70, w: 300, h: 230, root }],
    });
    revealWindow(useWorkspaceStore.getState().wins[1]);
    const group = useWorkspaceStore.getState().canvasGroups[0];
    expect(group.root.windowId).toBe('made-up-behind');
    expect(useWorkspaceStore.getState().activeId).toBe('made-up-behind');
  });

  test('a window hidden by a full-screen group ends the full screen, the way opening a window does', () => {
    useWorkspaceStore.setState({
      wins: [doc('made-up-inside', { groupId: 'made-up-group' }), doc('made-up-outside', { x: 900 })],
      canvasGroups: [{ id: 'made-up-group', x: 80, y: 80, w: 340, h: 240 }],
      groupFocus: { groupId: 'made-up-group', slot: '1', prevPan: { x: 0, y: 0 }, prevZoom: 1 },
      pan: { x: -40, y: -40 },
      zoom: 2,
    });
    revealWindow(useWorkspaceStore.getState().wins[0]);
    expect(useWorkspaceStore.getState().groupFocus).not.toBeNull();
    revealWindow(useWorkspaceStore.getState().wins[1]);
    expect(useWorkspaceStore.getState().groupFocus).toBeNull();
    expect(useWorkspaceStore.getState().zoom).toBe(1);
  });
});
