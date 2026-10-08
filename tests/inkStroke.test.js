import { buildInkStroke, cachedInkPath, coalescedSamples, inkPath, inkPoint, strokeBounds, tiltAmount } from '../src/lib/ink/stroke.js';

const line = (n, p = 0.5) => Array.from({ length: n }, (_, i) => ({ x: i * 4, y: Math.sin(i / 3) * 10, p }));

describe('pressure ink', () => {
  test('pen samples keep pressure and tilt; mouse samples get even pressure', () => {
    expect(inkPoint({ x: 1.234567, y: 2 }, { pointerType: 'pen', pressure: 0.8123456, tiltX: 30, tiltY: 0 }))
      .toEqual({ x: 1.23, y: 2, p: 0.812, t: 0.5 });
    expect(inkPoint({ x: 1, y: 2 }, { pointerType: 'mouse', pressure: 1 })).toEqual({ x: 1, y: 2, p: 0.5 });
    expect(tiltAmount({ tiltX: 80, tiltY: 80 })).toBe(1);
  });

  test('a stroke is stored in canvas units so it scales with the board', () => {
    const atOne = buildInkStroke(line(5), { color: 'var(--ink)', size: 4, zoom: 1 });
    const atTwo = buildInkStroke(line(5), { color: 'var(--ink)', size: 4, zoom: 2 });
    expect(atOne).toMatchObject({ ink: 1, size: 6, color: 'var(--ink)' });
    expect(atTwo.size).toBe(3);
    expect(buildInkStroke([], { size: 4 })).toBeNull();
    expect(buildInkStroke([{ x: 0, y: 0, p: 0.5 }], { size: 4 }).pts).toHaveLength(2); // a dot still draws
  });

  test('harder pressure draws a wider outline', () => {
    const width = (p) => {
      const b = strokeBoundsOfPath(inkPath({ id: 'a', pts: line(30, p).map((pt) => ({ ...pt, y: 0 })), size: 10 }));
      return b.h;
    };
    expect(width(0.95)).toBeGreaterThan(width(0.2) * 1.5);
  });

  test('outline is a closed SVG path and the cache follows moves', () => {
    const stroke = { id: 's1', ink: 1, pts: line(10), size: 6 };
    const d = cachedInkPath(stroke);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(cachedInkPath({ ...stroke })).toBe(d);
    const moved = { ...stroke, pts: stroke.pts.map((pt) => ({ ...pt, y: pt.y + 50 })) };
    expect(cachedInkPath(moved)).not.toBe(d);
  });

  test('coalesced samples fall back to the event itself', () => {
    const e = { getCoalescedEvents: () => [] };
    expect(coalescedSamples(e)).toEqual([e]);
    expect(coalescedSamples({ getCoalescedEvents: () => [1, 2] })).toEqual([1, 2]);
  });

  test('bounds include half the stroke width', () => {
    expect(strokeBounds([{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], size: 4 }])).toEqual({ x: -2, y: -2, w: 14, h: 4 });
    expect(strokeBounds([])).toBeNull();
  });
});

function strokeBoundsOfPath(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { h: Math.max(...ys) - Math.min(...ys) };
}
