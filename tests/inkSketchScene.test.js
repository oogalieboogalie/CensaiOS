import { pencilAsStroke, sceneBounds, sceneSvg } from '../src/lib/ink/rasterize.js';
import { strokesToSketchpadElements } from '../src/lib/ink/sketchActions.js';
import { cleanUpElements } from '../src/components/excalidraw/SketchpadActions.jsx';
import { rectPoints } from '../src/lib/ink/shapes.js';

const ink = (id, x, y) => ({ id, ink: 1, color: 'var(--ink)', size: 6, pts: [{ x, y, p: 0.4 }, { x: x + 40, y: y + 10, p: 0.9 }] });

describe('sketch scenes', () => {
  test('the SVG is cropped to the sketch with padding and resolves colors', () => {
    const scene = sceneSvg({ strokes: [ink('a', 100, 100), ink('b', 300, 200)], padding: 10, color: (c) => (c === 'var(--ink)' ? 'rgb(1, 2, 3)' : c), background: 'white' });
    expect(scene.bounds.x).toBeCloseTo(97);
    expect(scene.width).toBeCloseTo(scene.bounds.w + 20);
    expect(scene.svg).toContain('fill="rgb(1, 2, 3)"');
    expect(scene.svg).toContain('<rect');
    expect(sceneSvg({})).toBeNull();
  });

  test('Sketchpad elements render, text is escaped', () => {
    const elements = [
      { id: 't', type: 'text', x: 0, y: 0, text: '<b>Name</b>', color: 'black' },
      { id: 'r', type: 'rect', x: 0, y: 30, w: 120, h: 24, color: 'black', strokeWidth: 2 },
      { id: 'p', type: 'pencil', pts: [{ x: 0, y: 70 }, { x: 50, y: 80 }], color: 'black', strokeWidth: 3 },
    ];
    const { svg } = sceneSvg({ elements });
    expect(svg).toContain('&lt;b&gt;Name&lt;/b&gt;');
    expect(svg).toContain('<rect x="0" y="30"');
    expect(sceneBounds({ elements }).h).toBeGreaterThan(70);
    expect(pencilAsStroke({ id: 'p', pts: [], strokeWidth: 5 })).toMatchObject({ size: 8, sim: true });
  });

  test('canvas ink moves into a Sketchpad as pressure pencil marks', () => {
    const els = strokesToSketchpadElements([ink('a', 1000, 1000), ink('b', 1100, 1050)]);
    expect(els).toHaveLength(2);
    expect(els[0]).toMatchObject({ type: 'pencil', pen: true, color: 'var(--ink)' });
    expect(els[0].pts[0]).toMatchObject({ x: 35, y: 67, p: 0.4 });
  });

  test('Sketchpad clean up turns a rough box into a rectangle', () => {
    const rough = rectPoints({ x: 10, y: 10, w: 100, h: 50 }).map((p, i) => ({ x: p.x + (i % 2), y: p.y - (i % 2) }));
    const { elements, changed } = cleanUpElements([{ id: 'p', type: 'pencil', pts: rough, color: 'black', strokeWidth: 3 }, { id: 'x', type: 'rect', x: 0, y: 0, w: 5, h: 5 }]);
    expect(changed).toBe(1);
    expect(elements[0]).toMatchObject({ id: 'p', type: 'rect', color: 'black' });
    expect(elements[1].id).toBe('x');
  });
});
