import {
  fromMap, mapLayout, mapWindows, panToCenter, toMap, viewportRect, windowAt, worldBounds,
} from '../src/lib/canvas/minimapMath.js';

describe('board map math', () => {
  test('viewport is the screen in board coordinates', () => {
    expect(viewportRect({ x: -200, y: -100 }, 0.5, { w: 1000, h: 800 })).toEqual({ x: 400, y: 200, w: 2000, h: 1600 });
  });

  test('pinned, maximized and hidden-tab windows stay off the map', () => {
    const wins = [
      { id: 'a', x: 0, y: 0, w: 100, h: 100 },
      { id: 'b', x: 0, y: 0, w: 100, h: 100, pinned: true },
      { id: 'c', x: 0, y: 0, w: 100, h: 100, maximized: true },
      { id: 'd', x: 0, y: 0, w: 100, h: 100 },
      { id: 'e', x: NaN, y: 0, w: 100, h: 100 },
    ];
    expect(mapWindows(wins, new Set(['d'])).map((w) => w.id)).toEqual(['a']);
  });

  test('world covers every window and the screen, and the map keeps its shape', () => {
    const world = worldBounds([{ x: 0, y: 0, w: 400, h: 200 }, { x: 3000, y: 1000, w: 400, h: 200 }], { x: 0, y: 0, w: 1000, h: 800 });
    expect(world.x).toBeLessThan(0);
    expect(world.x + world.w).toBeGreaterThan(3400);
    const { scale, w, h } = mapLayout(world, 220, 140);
    expect(w).toBeLessThanOrEqual(220);
    expect(h).toBeLessThanOrEqual(140);
    expect(Math.abs(w / h - world.w / world.h)).toBeLessThan(0.1);
    expect(scale).toBeGreaterThan(0);
  });

  test('map and board points round-trip', () => {
    const world = { x: -100, y: -50, w: 2000, h: 1000 };
    const m = toMap({ x: 500, y: 250, w: 10, h: 10 }, world, 0.1);
    expect(fromMap(m.x, m.y, world, 0.1)).toEqual({ x: 500, y: 250 });
  });

  test('jumping centers the point on screen', () => {
    const pan = panToCenter({ x: 1000, y: 500 }, 2, { w: 1200, h: 800 });
    const view = viewportRect(pan, 2, { w: 1200, h: 800 });
    expect(view.x + view.w / 2).toBeCloseTo(1000);
    expect(view.y + view.h / 2).toBeCloseTo(500);
  });

  test('clicking finds the topmost window', () => {
    const wins = [{ id: 'under', x: 0, y: 0, w: 300, h: 300 }, { id: 'over', x: 100, y: 100, w: 100, h: 100 }];
    expect(windowAt({ x: 150, y: 150 }, wins).id).toBe('over');
    expect(windowAt({ x: 10, y: 10 }, wins).id).toBe('under');
    expect(windowAt({ x: 900, y: 900 }, wins)).toBeNull();
  });
});
