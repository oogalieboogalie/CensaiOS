import { applyPreset, cleanLayout, getBuiltInPresets, getGroupInnerBounds } from '../src/lib/layoutAlgo.js';
import { WINDOW_SIZE_CLASSES, nearestSizeClass, normalizeDefaultSize } from '../src/lib/windowSizeClasses.js';
import { DEFAULT_WINDOW_SIZES, getDefaultWindowSize } from '../src/lib/windowManifest.js';

const group = { x: 0, y: 0, w: 1600, h: 1000 };
const wins = (n) => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, kind: 'doc', x: i * 10, y: 0, w: 400, h: 300 }));
const layout = (presetId, list) => Object.fromEntries(
  cleanLayout(applyPreset(presetId, list), getGroupInnerBounds(group)).map((u) => [u.id, u.patch]),
);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('common group layouts', () => {
  test('every group of 2+ windows offers the same common layouts first', () => {
    for (const n of [2, 3, 4, 5, 7]) {
      const ids = getBuiltInPresets(n).map((p) => p.id);
      expect(ids.slice(0, 5)).toEqual(['SEMANTIC_WORKSPACE', 'COLUMNS', 'ROWS', 'GRID', 'MAIN_SIDEBAR']);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(getBuiltInPresets(1)).toEqual([]);
  });

  test.each(['COLUMNS', 'ROWS', 'GRID', 'MAIN_SIDEBAR'])('%s places every window without overlaps', (presetId) => {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const list = wins(n);
      const placed = layout(presetId, list);
      expect(Object.keys(placed).sort()).toEqual(list.map((w) => w.id).sort());
      const rects = Object.values(placed);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
      }
    }
  });

  test('side by side shares one row; stacked shares one column', () => {
    const cols = Object.values(layout('COLUMNS', wins(3)));
    expect(new Set(cols.map((r) => r.y)).size).toBe(1);
    const rows = Object.values(layout('ROWS', wins(3)));
    expect(new Set(rows.map((r) => r.x)).size).toBe(1);
  });

  test('grid of 4 is 2x2', () => {
    const rects = Object.values(layout('GRID', wins(4)));
    expect(new Set(rects.map((r) => r.x)).size).toBe(2);
    expect(new Set(rects.map((r) => r.y)).size).toBe(2);
  });

  test('main + sidebar keeps the biggest window in the main slot', () => {
    const list = wins(3);
    list[2] = { ...list[2], w: 900, h: 700 };
    const placed = layout('MAIN_SIDEBAR', list);
    expect(placed.w2.w).toBeGreaterThan(placed.w0.w);
    expect(placed.w2.x).toBeLessThan(placed.w0.x);
    expect(placed.w0.x).toBe(placed.w1.x);
  });

  test('legacy layout ids still arrange groups saved with them', () => {
    expect(Object.keys(layout('QUAD', wins(4)))).toHaveLength(4);
    expect(Object.keys(layout('SPLIT_LR', wins(2)))).toHaveLength(2);
  });
});

describe('normalized default window sizes', () => {
  const classSizes = Object.values(WINDOW_SIZE_CLASSES).map((s) => `${s.w}x${s.h}`);

  test('every window opens at one of the shared size classes (except fixed ones)', () => {
    const offClass = Object.entries(DEFAULT_WINDOW_SIZES)
      .filter(([, s]) => !classSizes.includes(`${s.w}x${s.h}`))
      .map(([kind]) => kind);
    expect(offClass).toEqual(['music']);
    expect(getDefaultWindowSize('chat')).toEqual(WINDOW_SIZE_CLASSES.compact);
    expect(getDefaultWindowSize('terminal')).toEqual(WINDOW_SIZE_CLASSES.wide);
  });

  test('size classes sit on the 16px layout grid', () => {
    for (const s of Object.values(WINDOW_SIZE_CLASSES)) {
      expect(s.w % 16).toBe(0);
      expect(s.h % 16).toBe(0);
    }
  });

  test('authored sizes snap to the nearest class; named and fixed classes win', () => {
    expect(nearestSizeClass({ w: 340, h: 460 })).toBe('compact');
    expect(nearestSizeClass({ w: 1120, h: 700 })).toBe('xl');
    expect(normalizeDefaultSize({ w: 340, h: 460 }, 'large')).toEqual(WINDOW_SIZE_CLASSES.large);
    expect(normalizeDefaultSize({ w: 333, h: 222 }, 'fixed')).toEqual({ w: 333, h: 222 });
    expect(normalizeDefaultSize(null)).toEqual(WINDOW_SIZE_CLASSES.standard);
  });
});
