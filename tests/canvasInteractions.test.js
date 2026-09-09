import {
  basenameFromPath,
  findRegionNeighbor,
  getSvgPathFromStroke,
  windowInsideGroup,
} from '../src/components/canvas/CanvasInteractions.js';

describe('Canvas interaction helpers', () => {
  test('serializes stroke points into an SVG path', () => {
    expect(getSvgPathFromStroke([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M 1 2 L 3 4');
  });

  test('finds a nearby region neighbor for snap placement', () => {
    const neighbor = findRegionNeighbor({ x: 0, y: 0, w: 100, h: 100 }, [
      { id: 'right', x: 125, y: 10, w: 80, h: 80 },
    ]);

    expect(neighbor).toEqual(expect.objectContaining({
      side: 'left',
      win: expect.objectContaining({ id: 'right' }),
    }));
  });

  test('checks window membership by center point', () => {
    expect(windowInsideGroup({ x: 10, y: 10, w: 40, h: 40 }, { x: 0, y: 0, w: 80, h: 80 })).toBe(true);
    expect(windowInsideGroup({ x: 100, y: 100, w: 40, h: 40 }, { x: 0, y: 0, w: 80, h: 80 })).toBe(false);
  });

  test('extracts the basename from Windows and POSIX paths', () => {
    expect(basenameFromPath('C:\\Projects\\Demo')).toBe('Demo');
    expect(basenameFromPath('/tmp/workspace')).toBe('workspace');
  });
});
