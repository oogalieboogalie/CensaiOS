import { trimForGrips } from '../src/lib/paneGrips.js';

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

// A Browser window frame at 100,100 sized 600 x 400; its page area starts under
// the 40 px header and runs to the frame's inner edge.
const page = box(101, 140, 598, 359);
// Window grips straddle the frame edge: 10 px edges, 18 px corners.
const corner = box(700 - 13, 500 - 13, 18, 18);
const rightEdge = box(695, 114, 10, 372);
const bottomEdge = box(114, 495, 572, 10);

describe('trimForGrips', () => {
  test('a page with no grips over it keeps its full size', () => {
    expect(trimForGrips(page, [box(0, 0, 10, 10)])).toEqual(page);
  });

  test('the bottom-right corner takes a short strip off the bottom of the page', () => {
    const out = trimForGrips(page, [corner]);
    expect(out.bottom).toBe(corner.top);
    expect(out.right).toBe(page.right);
    expect(out.left).toBe(page.left);
  });

  test('all the window grips together leave the corner and edges free', () => {
    const out = trimForGrips(page, [corner, rightEdge, bottomEdge]);
    expect(out.bottom).toBeLessThanOrEqual(corner.top);
    expect(out.right).toBeLessThanOrEqual(rightEdge.left);
    expect(out.top).toBe(page.top);
    expect(out.width).toBeGreaterThan(560);
    expect(out.height).toBeGreaterThan(340);
  });

  test('a group corner over the bottom-right Browser tile is left free', () => {
    const tile = box(400, 300, 300, 200);
    const groupCorner = box(676, 476, 24, 24);
    const out = trimForGrips(tile, [groupCorner]);
    expect(out.bottom).toBe(476);
    expect(out.right).toBe(700);
  });
});

test('a corner a fraction of a pixel wider than it is tall still trims the bottom', () => {
  const tile = box(400, 300, 300.4, 200);
  const out = trimForGrips(tile, [box(676.6, 476, 24, 24)]);
  expect(out.bottom).toBe(476);
  expect(out.right).toBeCloseTo(700.4);
});
