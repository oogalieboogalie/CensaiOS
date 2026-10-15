import { isAreaClear } from '../src/lib/nativeBrowserPane.js';

// A 1000 x 800 app window. `covered` is a box that sits on top of the page
// area; every other point lands inside it.
function setup(covered = null) {
  const area = { contains: (node) => node === 'area' };
  global.window = { innerWidth: 1000, innerHeight: 800 };
  global.document = {
    elementFromPoint: (x, y) => {
      if (covered && x >= covered.left && x <= covered.right && y >= covered.top && y <= covered.bottom) return 'other';
      return 'area';
    },
  };
  return area;
}

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

afterEach(() => {
  delete global.window;
  delete global.document;
});

describe('isAreaClear', () => {
  test('a page fully on screen and uncovered shows', () => {
    const area = setup();
    expect(isAreaClear(area, box(100, 100, 400, 300), { clip: true })).toBe(true);
  });

  test('a Browser window dragged partly off the left edge keeps showing its page', () => {
    const area = setup();
    expect(isAreaClear(area, box(-200, 100, 600, 400), { clip: true })).toBe(true);
    expect(isAreaClear(area, box(700, 500, 600, 400), { clip: true })).toBe(true);
  });

  test('a docked app window still hides when partly off screen', () => {
    const area = setup();
    expect(isAreaClear(area, box(-200, 100, 600, 400))).toBe(false);
  });

  test('a window fully off screen hides', () => {
    const area = setup();
    expect(isAreaClear(area, box(-700, 100, 600, 400), { clip: true })).toBe(false);
  });

  test('something covering the on-screen part still hides it', () => {
    const area = setup(box(0, 0, 150, 150));
    expect(isAreaClear(area, box(-200, 100, 600, 400), { clip: true })).toBe(false);
  });

  test('a group\'s hover-only resize corner over a Browser tile does not blank the page', () => {
    // The corner shows when the mouse moves into the group from another window.
    const corner = { closest: (sel) => (sel === '[data-pane-passthrough]' ? corner : null) };
    const area = { contains: (node) => node === 'area' };
    global.window = { innerWidth: 1000, innerHeight: 800 };
    global.document = { elementFromPoint: (x, y) => (x > 470 && y > 370 ? corner : 'area') };
    expect(isAreaClear(area, box(100, 100, 400, 300), { clip: true })).toBe(true);
  });

  test('a real window over the same corner still hides the page', () => {
    const other = { closest: () => null };
    const area = { contains: (node) => node === 'area' };
    global.window = { innerWidth: 1000, innerHeight: 800 };
    global.document = { elementFromPoint: (x, y) => (x > 470 && y > 370 ? other : 'area') };
    expect(isAreaClear(area, box(100, 100, 400, 300), { clip: true })).toBe(false);
  });
});
