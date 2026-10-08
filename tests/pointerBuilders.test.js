import {
  blurActiveEditable,
  buildBandBox,
  buildFreehandStroke,
  buildPinchStart,
  buildRectStroke,
  computePinchZoom,
  consumeSuppression,
  isInteractivePanTarget,
  shouldStartCanvasPan,
} from '../src/components/canvas/pointerBuilders.js';
import { jest } from '@jest/globals';
import { MAX_ZOOM, MIN_ZOOM } from '../src/lib/canvasMath.js';

describe('shouldStartCanvasPan', () => {
  test.each([
    [1, false, 'both', true],
    [1, false, 'middle', true],
    [1, false, 'off', false],
    [0, true, 'both', true],
    [0, false, 'both', false],
    [2, true, 'both', false],
  ])('button=%i held=%p mode=%s -> %p', (button, held, mode, expected) => {
    expect(shouldStartCanvasPan(button, held, mode)).toBe(expected);
  });
});

describe('buildBandBox', () => {
  test('normalizes corners and flags group/selection modes', () => {
    const box = buildBandBox({ x0: 30, y0: 40, mode: 'selection' }, { x: 10, y: 5 });
    expect(box).toMatchObject({ x: 10, y: 5, w: 20, h: 35, mode: 'selection', isGroup: false, isSelection: true });
    expect(buildBandBox({ x0: 0, y0: 0, mode: 'group' }, { x: 3, y: 4 }).isGroup).toBe(true);
  });
});

describe('buildFreehandStroke', () => {
  test.each([[null], [undefined], [[]], [[{ x: 1, y: 2 }]]])('returns null for %p', (path) => {
    expect(buildFreehandStroke(path, 'red', 4)).toBeNull();
  });

  test('commits pressure-weighted stroke preserving the path reference', () => {
    const path = [{ x: 0, y: 0, p: 1 }, { x: 2, y: 2, p: 3 }];
    const stroke = buildFreehandStroke(path, 'red', 4);
    expect(stroke.pts).toBe(path);
    expect(stroke).toMatchObject({ color: 'red', size: 8 });
    expect(typeof stroke.id).toBe('string');
  });

  test('floors the pressure multiplier at 0.35 (zero pressure falls back to 1)', () => {
    const flat = buildFreehandStroke([{ x: 0, y: 0, p: 0 }, { x: 1, y: 1 }], 'red', 10);
    expect(flat.size).toBeCloseTo(10);
    const faint = buildFreehandStroke([{ x: 0, y: 0, p: 0.1 }, { x: 1, y: 1, p: 0.1 }], 'red', 10);
    expect(faint.size).toBeCloseTo(3.5);
  });
});

describe('buildRectStroke', () => {
  test('rejects missing or undersized bands', () => {
    expect(buildRectStroke(null, 1, 'red', 4)).toBeNull();
    expect(buildRectStroke({ x: 0, y: 0, w: 8, h: 9 }, 1, 'red', 4)).toBeNull();
    expect(buildRectStroke({ x: 0, y: 0, w: 9, h: 8 }, 1, 'red', 4)).toBeNull();
  });

  test('builds a closed 5-point rect in pen color/size', () => {
    const stroke = buildRectStroke({ x: 1, y: 2, w: 10, h: 20 }, 1, 'blue', 3);
    expect(stroke).toMatchObject({ color: 'blue', size: 3 });
    expect(stroke.pts).toEqual([
      { x: 1, y: 2, p: 1 },
      { x: 11, y: 2, p: 1 },
      { x: 11, y: 22, p: 1 },
      { x: 1, y: 22, p: 1 },
      { x: 1, y: 2, p: 1 },
    ]);
  });

  test('scales the minimum size by zoom', () => {
    expect(buildRectStroke({ x: 0, y: 0, w: 5, h: 5 }, 2, 'red', 4)).not.toBeNull();
  });
});

describe('computePinchZoom', () => {
  const start = { startZoom: 1, startDistance: 100, startPanX: 0, startPanY: 0 };
  const rect = { left: 0, top: 0 };

  test('zooms proportionally to finger spread around the midpoint', () => {
    const next = computePinchZoom({ x: 0, y: 0 }, { x: 200, y: 0 }, rect, start);
    expect(next.zoom).toBeCloseTo(2);
    expect(next).toEqual(expect.objectContaining({ zoom: expect.any(Number) }));
    expect(Number.isFinite(next.panX) && Number.isFinite(next.panY)).toBe(true);
  });

  test('clamps to the zoom bounds', () => {
    const wayOut = computePinchZoom({ x: 0, y: 0 }, { x: 100000, y: 0 }, rect, start);
    expect(wayOut.zoom).toBe(MAX_ZOOM);
    const pinchedShut = computePinchZoom({ x: 0, y: 0 }, { x: 0, y: 0 }, rect, start);
    expect(pinchedShut.zoom).toBe(MIN_ZOOM);
  });
});

describe('consumeSuppression', () => {
  test('reads and resets the flag', () => {
    const ref = { current: true };
    expect(consumeSuppression(ref)).toBe(true);
    expect(ref.current).toBe(false);
    expect(consumeSuppression(ref)).toBe(false);
  });
});

describe('blurActiveEditable', () => {
  const fakeDoc = (el) => ({ activeElement: el });

  test.each([
    ['INPUT', 'inherit'],
    ['TEXTAREA', 'inherit'],
    ['DIV', 'true'],
  ])('blurs a focused %s (contentEditable=%s)', (tagName, contentEditable) => {
    const el = { tagName, contentEditable, blur: jest.fn() };
    blurActiveEditable(fakeDoc(el));
    expect(el.blur).toHaveBeenCalledTimes(1);
  });

  test('leaves non-editable focus alone and tolerates no focus', () => {
    const button = { tagName: 'BUTTON', contentEditable: 'inherit', blur: jest.fn() };
    blurActiveEditable(fakeDoc(button));
    expect(button.blur).not.toHaveBeenCalled();
    expect(() => blurActiveEditable(fakeDoc(null))).not.toThrow();
  });
});

describe('isInteractivePanTarget', () => {
  test('true when the target sits inside interactive canvas UI', () => {
    const closest = jest.fn(() => ({}));
    expect(isInteractivePanTarget({ closest })).toBe(true);
    expect(closest.mock.calls[0][0]).toContain('[data-canvas-ui]');
    expect(closest.mock.calls[0][0]).toContain('button');
  });

  test('false for bare canvas background and for missing targets', () => {
    expect(isInteractivePanTarget({ closest: () => null })).toBe(false);
    expect(isInteractivePanTarget(null)).toBe(false);
    expect(isInteractivePanTarget({})).toBe(false);
  });
});

describe('buildPinchStart', () => {
  test('captures finger distance plus the zoom and pan at pinch start', () => {
    expect(buildPinchStart({ x: 0, y: 0 }, { x: 3, y: 4 }, 1.5, { x: 10, y: 20 })).toEqual({
      startDistance: 5, startZoom: 1.5, startPanX: 10, startPanY: 20,
    });
  });

  test('never reports a zero distance (would divide by zero on move)', () => {
    expect(buildPinchStart({ x: 7, y: 7 }, { x: 7, y: 7 }, 1, { x: 0, y: 0 }).startDistance).toBe(1);
  });
});
