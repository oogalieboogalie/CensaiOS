import { buildArrowStroke, buildEllipseStroke, buildLineStroke, commitShape, isShapeMode } from '../src/components/canvas/shapeStrokes.js';
import { highlightInk } from '../src/components/canvas/highlightInk.js';
import { beginCanvasDrag } from '../src/components/canvas/toolDrag.js';
import { canvasCursor } from '../src/components/canvas/canvasCursor.js';

const ink = { color: 'var(--ink)', size: 4 };

describe('straight shapes', () => {
  test('a line is the two ends of the drag', () => {
    const stroke = buildLineStroke(5, 6, 40, 10, 1, ink.color, ink.size);
    expect(stroke.pts).toEqual([{ x: 5, y: 6, p: 1 }, { x: 40, y: 10, p: 1 }]);
    expect(stroke.color).toBe('var(--ink)');
    expect(stroke.size).toBe(4);
  });

  test('a short line is not kept', () => {
    expect(buildLineStroke(0, 0, 3, 4, 1, ink.color, ink.size)).toBeNull();
  });

  test('an ellipse follows the drag box and closes', () => {
    const stroke = buildEllipseStroke({ x: 10, y: 20, w: 100, h: 50 }, 1, ink.color, ink.size);
    expect(stroke.pts).toHaveLength(41);
    expect(stroke.pts[0].x).toBeCloseTo(110);
    expect(stroke.pts[0].y).toBeCloseTo(45);
    expect(stroke.pts.at(-1).x).toBeCloseTo(stroke.pts[0].x);
    expect(stroke.pts.at(-1).y).toBeCloseTo(stroke.pts[0].y);
    const xs = stroke.pts.map((pt) => pt.x);
    const ys = stroke.pts.map((pt) => pt.y);
    expect(Math.min(...xs)).toBeCloseTo(10);
    expect(Math.max(...xs)).toBeCloseTo(110);
    expect(Math.min(...ys)).toBeCloseTo(20);
    expect(Math.max(...ys)).toBeCloseTo(70);
  });

  test('a tiny ellipse is not kept', () => {
    expect(buildEllipseStroke({ x: 0, y: 0, w: 4, h: 40 }, 1, ink.color, ink.size)).toBeNull();
  });

  test('an arrow ends at the drag tip and each barb comes back to it', () => {
    const stroke = buildArrowStroke(0, 0, 100, 0, 1, ink.color, ink.size);
    const tip = { x: 100, y: 0, p: 1 };
    expect(stroke.pts[0]).toEqual({ x: 0, y: 0, p: 1 });
    expect(stroke.pts[1]).toEqual(tip);
    expect(stroke.pts[3]).toEqual(tip);
    expect(stroke.pts[5]).toEqual(tip);
    expect(stroke.pts[2].x).toBeLessThan(100);
    expect(stroke.pts[2].y).not.toBe(0);
    expect(stroke.pts[4].y).toBeCloseTo(-stroke.pts[2].y);
  });

  test('a short arrow is not kept', () => {
    expect(buildArrowStroke(0, 0, 2, 2, 1, ink.color, ink.size)).toBeNull();
  });

  test('commit picks the shape that was dragged', () => {
    expect(isShapeMode('line')).toBe(true);
    expect(isShapeMode('text')).toBe(false);
    const line = commitShape({
      mode: 'line', from: { x0: 0, y0: 0, x1: 30, y1: 0 }, zoom: 1, penColor: ink.color, penSize: ink.size,
    });
    expect(line.pts).toHaveLength(2);
    const box = commitShape({
      mode: 'rect', band: { x: 0, y: 0, w: 20, h: 20 }, zoom: 1, penColor: ink.color, penSize: ink.size,
    });
    expect(box.pts).toHaveLength(5);
    expect(box.pts[0]).toEqual(box.pts.at(-1));
  });
});

describe('highlighter', () => {
  test('uses the pen colour, washed out, on a wider stroke', () => {
    expect(highlightInk('var(--ink)', 4)).toEqual({
      color: 'color-mix(in oklab, var(--ink) 45%, transparent)',
      size: 16,
    });
    expect(highlightInk('var(--canvas-pen-blue)', 8).size).toBe(32);
  });
});

describe('which drag a tool starts', () => {
  const base = { pointerId: 3, canvasPt: { x: 1, y: 2 }, shiftKey: false, penColor: 'var(--ink)', penSize: 4, penMode: false, isPen: false, isPenEraser: false };

  test('highlight draws with the washed-out ink', () => {
    const started = beginCanvasDrag({ ...base, activeTool: 'highlight' });
    expect(started.draw).toBe(true);
    expect(started.ink.color).toContain('color-mix');
    expect(started.ink.size).toBe(16);
  });

  test('a shape remembers where the drag began', () => {
    const started = beginCanvasDrag({ ...base, activeTool: 'arrow' });
    expect(started.drag).toMatchObject({ x0: 1, y0: 2, mode: 'arrow', started: false });
    expect(started.draw).toBeUndefined();
  });

  test('the brush still draws and select still selects', () => {
    expect(beginCanvasDrag({ ...base, activeTool: 'pen' }).draw).toBe(true);
    expect(beginCanvasDrag({ ...base, activeTool: 'select' }).drag.mode).toBe('selection');
    expect(beginCanvasDrag({ ...base, activeTool: 'select', shiftKey: true }).drag.mode).toBe('region');
  });
});

describe('board cursor', () => {
  const still = { penMode: false, isPanning: false, spaceHeld: false };

  test('drawing tools use a crosshair', () => {
    for (const activeTool of ['pen', 'highlight', 'rect', 'ellipse', 'line', 'arrow', 'lasso']) {
      expect(canvasCursor({ ...still, activeTool })).toBe('crosshair');
    }
    expect(canvasCursor({ ...still, activeTool: 'text' })).toBe('text');
    expect(canvasCursor({ ...still, activeTool: 'eraser' })).toBe('cell');
  });
});
