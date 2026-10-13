import { createPalmFilter } from '../src/lib/ink/palmFilter.js';
import { cleanUpStroke, ellipsePoints, pointInPolygon, recognizeShape, rectPoints, strokesInBox, strokesInLasso } from '../src/lib/ink/shapes.js';

describe('palm rejection', () => {
  function clock() { let t = 0; return { now: () => t, advance: (ms) => { t += ms; } }; }
  const pen = (phase, id = 1) => [{ pointerType: 'pen', pointerId: id }, phase];
  const touch = (phase, id = 9, size = 12) => [{ pointerType: 'touch', pointerId: id, width: size, height: size }, phase];

  test('a fingertip navigates; a large contact patch is a palm', () => {
    const f = createPalmFilter();
    expect(f.classify(...touch('down'))).toBe('touch');
    expect(f.classify(...touch('down', 10, 60))).toBe('palm');
    expect(f.classify(...touch('move', 10, 12))).toBe('palm'); // stays a palm until it lifts
    expect(f.classify(...touch('up', 10))).toBe('palm');
    expect(f.classify(...touch('down', 10))).toBe('touch');
  });

  test('a touch while the pen is down, or just after it lifts or hovers, is a palm', () => {
    const c = clock();
    const f = createPalmFilter({ now: c.now });
    f.classify(...pen('down'));
    expect(f.penDown).toBe(true);
    expect(f.classify(...touch('down', 20))).toBe('palm');
    f.classify(...pen('up'));
    c.advance(200);
    expect(f.classify(...touch('down', 21))).toBe('palm');
    c.advance(1000);
    expect(f.classify(...touch('down', 22))).toBe('touch');
    f.classify(...pen('move')); // hover
    expect(f.classify(...touch('down', 23))).toBe('palm');
    expect(f.penSeen).toBe(true);
    expect(f.classify({ pointerType: 'mouse' }, 'down')).toBe('mouse');
  });
});

describe('shape cleanup', () => {
  const jitter = (pts) => pts.map((p, i) => ({ x: p.x + ((i % 3) - 1) * 1.5, y: p.y + ((i % 2) ? 1.2 : -1.2) }));

  test('recognizes a rough line, box and circle', () => {
    expect(recognizeShape(jitter(Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: i * 3 })))).kind).toBe('line');
    expect(recognizeShape(jitter(rectPoints({ x: 0, y: 0, w: 200, h: 120 }))).kind).toBe('rect');
    expect(recognizeShape(jitter(ellipsePoints({ x: 0, y: 0, w: 160, h: 100 })))).toMatchObject({ kind: 'ellipse' });
  });

  test('leaves scribbles alone', () => {
    const zigzag = Array.from({ length: 30 }, (_, i) => ({ x: i * 6, y: (i % 2) * 40 }));
    expect(recognizeShape(zigzag)).toBeNull();
    expect(cleanUpStroke({ id: 'z', pts: zigzag, size: 4 })).toBeNull();
  });

  test('a cleaned stroke keeps its id and color, with even pressure', () => {
    const out = cleanUpStroke({ id: 'r', color: 'var(--ink)', size: 4, sim: true, pts: jitter(rectPoints({ x: 10, y: 10, w: 100, h: 60 })) });
    expect(out).toMatchObject({ id: 'r', color: 'var(--ink)', ink: 1, shape: 'rect' });
    expect(out.sim).toBeUndefined();
    expect(out.pts.every((p) => p.p === 0.5)).toBe(true);
  });
});

describe('selecting strokes', () => {
  const strokes = [
    { id: 'in', pts: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
    { id: 'half', pts: [{ x: 40, y: 40 }, { x: 140, y: 140 }] },
    { id: 'out', pts: [{ x: 300, y: 300 }, { x: 310, y: 310 }] },
  ];
  const loop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

  test('point in polygon', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, loop)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, loop)).toBe(false);
  });

  test('lasso picks strokes mostly inside the loop; box picks strokes fully inside', () => {
    expect(strokesInLasso(strokes, loop)).toEqual(['in']);
    expect(strokesInLasso(strokes, loop, 0.5)).toEqual(['in', 'half']);
    expect(strokesInBox(strokes, { x: 0, y: 0, w: 200, h: 200 })).toEqual(['in', 'half']);
    expect(strokesInLasso(strokes, [{ x: 0, y: 0 }])).toEqual([]);
  });
});
