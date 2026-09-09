import { isPointInRect } from './canvasMath.js';

describe('isPointInRect', () => {
  test('returns true for point completely inside rectangle', () => {
    expect(isPointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
  });

  test('returns false for point outside the rectangle', () => {
    expect(isPointInRect(-1, 5, 0, 0, 10, 10)).toBe(false); // left
    expect(isPointInRect(11, 5, 0, 0, 10, 10)).toBe(false); // right
    expect(isPointInRect(5, -1, 0, 0, 10, 10)).toBe(false); // top
    expect(isPointInRect(5, 11, 0, 0, 10, 10)).toBe(false); // bottom
  });

  test('returns true for points exactly on the boundary', () => {
    expect(isPointInRect(0, 5, 0, 0, 10, 10)).toBe(true); // left edge
    expect(isPointInRect(10, 5, 0, 0, 10, 10)).toBe(true); // right edge
    expect(isPointInRect(5, 0, 0, 0, 10, 10)).toBe(true); // top edge
    expect(isPointInRect(5, 10, 0, 0, 10, 10)).toBe(true); // bottom edge
  });

  test('returns true for points exactly on corners', () => {
    expect(isPointInRect(0, 0, 0, 0, 10, 10)).toBe(true); // top-left
    expect(isPointInRect(10, 0, 0, 0, 10, 10)).toBe(true); // top-right
    expect(isPointInRect(0, 10, 0, 0, 10, 10)).toBe(true); // bottom-left
    expect(isPointInRect(10, 10, 0, 0, 10, 10)).toBe(true); // bottom-right
  });

  test('works correctly with negative rectangle coordinates', () => {
    expect(isPointInRect(-5, -5, -10, -10, 10, 10)).toBe(true); // inside
    expect(isPointInRect(1, -5, -10, -10, 10, 10)).toBe(false); // outside right
  });

  test('works correctly with rectangles of zero width and/or height', () => {
    expect(isPointInRect(5, 5, 5, 5, 0, 0)).toBe(true);
    expect(isPointInRect(6, 5, 5, 5, 0, 0)).toBe(false);
  });
});
