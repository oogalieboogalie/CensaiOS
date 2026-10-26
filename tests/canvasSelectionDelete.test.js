/**
 * @jest-environment jsdom
 */
import { isCanvasBackground, isCanvasSelectionSurface, resolveMultiSelectContextDelete } from '../src/components/canvas/canvasSelectionSurface.js';

function el(attrs = {}) {
  const node = document.createElement('div');
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) node.setAttribute(name, 'true');
    else node.setAttribute(name, String(value));
  }
  return node;
}

const wins = [
  { id: 'one', x: 10, y: 10, w: 40, h: 40 },
  { id: 'two', x: 80, y: 10, w: 40, h: 40 },
  { id: 'three', x: 200, y: 200, w: 40, h: 40 },
];

describe('canvas multi-select context delete', () => {
  test('board and region backdrops count as selection surfaces via hasAttribute', () => {
    const board = el({ 'data-canvas-bg': true });
    const region = el({ 'data-canvas-context-surface': true });
    expect(isCanvasSelectionSurface(board)).toBe(true);
    expect(isCanvasSelectionSurface(region)).toBe(true);
    expect(isCanvasBackground(board, null)).toBe(true);
    expect(isCanvasSelectionSurface(el())).toBe(false);
  });

  test('right-click inside a multi-selection returns every selected id', () => {
    const ids = resolveMultiSelectContextDelete({
      target: el({ 'data-canvas-bg': true }),
      selectedIds: ['one', 'two'],
      wins,
      pan: { x: 0, y: 0 },
      zoom: 1,
      canvasRect: { left: 0, top: 0, width: 400, height: 400 },
      clientX: 60,
      clientY: 30,
    });
    expect(ids).toEqual(['one', 'two']);
  });

  test('right-click outside the selection bounds does not delete', () => {
    expect(resolveMultiSelectContextDelete({
      target: el({ 'data-canvas-bg': true }),
      selectedIds: ['one', 'two'],
      wins,
      pan: { x: 0, y: 0 },
      zoom: 1,
      canvasRect: { left: 0, top: 0, width: 400, height: 400 },
      clientX: 300,
      clientY: 300,
    })).toBeNull();
  });

  test('a single selected window does not use multi-select context delete', () => {
    expect(resolveMultiSelectContextDelete({
      target: el({ 'data-canvas-bg': true }),
      selectedIds: ['one'],
      wins,
      pan: { x: 0, y: 0 },
      zoom: 1,
      canvasRect: { left: 0, top: 0, width: 400, height: 400 },
      clientX: 20,
      clientY: 20,
    })).toBeNull();
  });
});
