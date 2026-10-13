/** @jest-environment jsdom */
import {
  findFreeSpot, nearestFreeSpot, cascadeSpot, visibleCanvasRect, boardObstacles, panToShow, FREE_SPOT_GAP,
} from '../src/lib/freeSpot.js';
import { useWorkspaceStore } from '../src/lib/store.js';

const VIEW = { pan: { x: 0, y: 0 }, zoom: 1, width: 1600, height: 900 };
const STANDARD = { w: 560, h: 448 };

const overlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
  && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

// Opens n windows the way the board does, following the view when it glides.
function openMany(n, size = STANDARD, start = VIEW) {
  const wins = [];
  let view = start;
  for (let i = 0; i < n; i += 1) {
    const p = findFreeSpot(size, { ...view, wins });
    if (p.pan) view = { ...view, pan: p.pan };
    wins.push({ id: `w${i}`, x: p.x, y: p.y, w: size.w, h: size.h, view });
  }
  return wins;
}

describe('new windows open in free space', () => {
  test('first window opens centred in the view', () => {
    const p = findFreeSpot(STANDARD, { ...VIEW, wins: [] });
    const view = visibleCanvasRect(VIEW);
    expect(Math.abs(p.x + STANDARD.w / 2 - (view.x + view.w / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y + STANDARD.h / 2 - (view.y + view.h / 2))).toBeLessThanOrEqual(1);
  });

  test('windows never cover each other and keep a gap', () => {
    const wins = openMany(9, { w: 368, h: 380 });
    for (let i = 0; i < wins.length; i += 1) {
      for (let j = i + 1; j < wins.length; j += 1) {
        expect(overlap(wins[i], wins[j], FREE_SPOT_GAP - 1)).toBe(false);
      }
    }
  });

  test('every new window ends up inside what the person can see', () => {
    for (const w of openMany(9, { w: 368, h: 380 })) {
      const view = visibleCanvasRect(w.view);
      expect(w.x).toBeGreaterThanOrEqual(view.x - 1);
      expect(w.y).toBeGreaterThanOrEqual(view.y - 1);
      expect(w.x + w.w).toBeLessThanOrEqual(view.x + view.w + 1);
      expect(w.y + w.h).toBeLessThanOrEqual(view.y + view.h + 1);
    }
  });

  test('follows the view when panned and zoomed', () => {
    const view = { pan: { x: -2000, y: -1000 }, zoom: 0.5, width: 1600, height: 900 };
    const rect = visibleCanvasRect(view);
    const p = findFreeSpot(STANDARD, { ...view, wins: [] });
    expect(p.x).toBeGreaterThan(rect.x);
    expect(p.x + STANDARD.w).toBeLessThan(rect.x + rect.w);
  });

  test('stays clear of groups', () => {
    const view = visibleCanvasRect(VIEW);
    const group = { id: 'g', x: view.x + view.w / 2 - 300, y: view.y, w: 600, h: view.h };
    const p = findFreeSpot({ w: 368, h: 380 }, { ...VIEW, wins: [], groups: [group] });
    expect(overlap({ ...p, w: 368, h: 380 }, group)).toBe(false);
  });

  test('ignores pinned and maximized windows, which float above the board', () => {
    const rects = boardObstacles([
      { x: 0, y: 0, w: 100, h: 100, pinned: true },
      { x: 0, y: 0, w: 100, h: 100, maximized: true },
      { x: 0, y: 0, width: 100, height: 100 },
    ]);
    expect(rects).toEqual([{ x: 0, y: 0, w: 100, h: 100 }]);
  });

  test('a full view glides a short way to the next spot just past the edge', () => {
    const wins = openMany(3, { w: 368, h: 380 });
    const p = findFreeSpot({ w: 368, h: 380 }, { ...VIEW, wins });
    expect(p.pan).not.toBeNull();
    expect(Math.hypot(p.pan.x, p.pan.y)).toBeLessThan(400);
  });

  test('panToShow only moves the board when the window is off screen', () => {
    expect(panToShow({ x: 100, y: 100, w: 200, h: 200 }, VIEW)).toBeNull();
    expect(panToShow({ x: 1500, y: 100, w: 200, h: 200 }, VIEW)).toEqual({ x: -124, y: 0 });
  });

  test('a window bigger than the screen falls back to a tidy diagonal step, not a pile', () => {
    const big = { w: 1700, h: 1000 };
    const wins = openMany(4, big);
    expect(new Set(wins.map(w => `${w.x},${w.y}`)).size).toBe(4);
    expect(wins.every(w => w.view === VIEW)).toBe(true);
    expect(wins[2].x - wins[1].x).toBe(wins[2].y - wins[1].y);
  });

  test('a window bigger than the view gets no free spot', () => {
    expect(nearestFreeSpot({ w: 5000, h: 300 }, { x: 0, y: 0, w: 1000, h: 800 }, [])).toBeNull();
    expect(cascadeSpot({ w: 5000, h: 300 }, { x: 0, y: 0, w: 1000, h: 800 }, [])).toEqual({ x: -2000, y: 250 });
  });
});

describe('spawnAt uses the free spot', () => {
  beforeEach(() => {
    window.innerWidth = 1600;
    window.innerHeight = 900;
    useWorkspaceStore.setState({ wins: [], canvasGroups: [], pan: { x: 0, y: 0 }, zoom: 1 });
  });

  test('six new windows do not stack on one spot', () => {
    const { spawnAt } = useWorkspaceStore.getState();
    for (let i = 0; i < 6; i += 1) spawnAt('notes');
    const wins = useWorkspaceStore.getState().wins;
    expect(new Set(wins.map(w => `${w.x},${w.y}`)).size).toBe(6);
  });

  test('an explicit position still wins', () => {
    const id = useWorkspaceStore.getState().spawnAt('notes', {}, { x: 7, y: 9 });
    const w = useWorkspaceStore.getState().wins.find(x => x.id === id);
    expect([w.x, w.y]).toEqual([7, 9]);
  });
});
