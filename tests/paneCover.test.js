import { coverLogLine, fitPane, hiddenMessage, MIN_SHOWN_SHARE, trimAround } from '../src/lib/paneCover.js';
import { gripRects } from '../src/lib/paneGrips.js';

// A tiny stand-in for the board: the Browser page area plus layers on top of
// it. Each layer is another window frame, something pinned to the screen
// (position: fixed, like Censai's button) or plain canvas chrome.
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

function node(name, { parent = null, rect = box(0, 0, 0, 0), attrs = [], fixed = false } = {}) {
  const n = {
    name, parentElement: parent, attrs, fixed,
    getBoundingClientRect: () => rect,
    hasAttribute: (attr) => attrs.includes(attr),
    contains: (other) => { for (let o = other; o; o = o.parentElement) if (o === n) return true; return false; },
    closest: (sel) => {
      const attr = sel.slice(1, -1);
      for (let o = n; o; o = o.parentElement) if (o.attrs.includes(attr)) return o;
      return null;
    },
  };
  return n;
}

const positionOf = (n) => (n.fixed ? 'fixed' : 'static');
const body = node('body');
const PAGE = box(100, 100, 600, 400);

// `marked` is what the page finds with querySelectorAll: window frames and
// panels marked data-pane-cover. By default, those owning each layer.
const markedOf = (layers) => layers
  .map((l) => l.closest('[data-win-frame]') || l.closest('[data-pane-cover]'))
  .filter(Boolean);

function board(layers = [], { marked = markedOf(layers) } = {}) {
  const myFrame = node('browser-frame', { parent: body, attrs: ['data-win-frame'], rect: box(100, 60, 600, 440) });
  const el = node('page-area', { parent: myFrame, rect: PAGE });
  global.window = { innerWidth: 1200, innerHeight: 800 };
  const doc = {
    querySelectorAll: () => [myFrame, ...marked],
    elementFromPoint: (x, y) => {
      for (const layer of layers) {
        const r = layer.hitRect || layer.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return layer;
      }
      return el;
    },
  };
  return { el, doc, fit: (rect = PAGE, opts = {}) => fitPane(el, rect, { clip: true, doc, positionOf, ...opts }) };
}

const otherWindow = (rect) => {
  const frame = node('other-window', { parent: body, attrs: ['data-win-frame'], rect });
  const inside = node('other-window-body', { parent: frame, rect });
  return inside;
};

const censaiButton = (rect) => {
  const aside = node('censai-pinned', { parent: body, fixed: true, attrs: ['data-pane-cover'], rect });
  const button = node('censai-dot', { parent: aside, rect: box(rect.left + 20, rect.top + 20, 8, 8) });
  button.hitRect = rect;
  return button;
};

afterEach(() => { delete global.window; });

describe('fitPane: the desktop Browser page and what sits on top of it', () => {
  test('nothing on top: the whole page shows', () => {
    const { fit } = board();
    expect(fit()).toEqual({ clear: true, rect: expect.objectContaining({ left: 100, top: 100, width: 600, height: 400 }) });
  });

  test("Censai's round button over the bottom-right corner no longer blacks out the page", () => {
    const bubble = box(660, 460, 60, 60);
    const { fit } = board([censaiButton(bubble)]);
    const out = fit();
    expect(out.clear).toBe(true);
    expect(out.trimmedBy).toBe('pinned');
    // The page stops short of the button, so the button stays visible and clickable.
    const clearOfButton = out.rect.bottom <= bubble.top || out.rect.right <= bubble.left;
    expect(clearOfButton).toBe(true);
    expect(out.rect.width * out.rect.height).toBeGreaterThan(600 * 400 * 0.85);
  });

  test('another window over one corner: the page shrinks back from it', () => {
    const corner = box(560, 50, 300, 140);
    const { fit } = board([otherWindow(corner)]);
    const out = fit();
    expect(out.clear).toBe(true);
    expect(out.trimmedBy).toBe('window');
    const overlaps = out.rect.left < corner.right && out.rect.right > corner.left && out.rect.top < corner.bottom && out.rect.bottom > corner.top;
    expect(overlaps).toBe(false);
  });

  test('another window over the middle of an edge is seen too', () => {
    const edge = box(300, 420, 200, 200);
    const { fit } = board([otherWindow(edge)]);
    const out = fit();
    expect(out.clear).toBe(true);
    expect(out.rect.bottom).toBeLessThanOrEqual(edge.top);
  });

  test('another window over most of the page: hidden, and it says a click brings it back', () => {
    const { fit } = board([otherWindow(box(80, 80, 500, 380))]);
    const out = fit();
    expect(out).toEqual({ clear: false, hiddenBy: 'window' });
    expect(hiddenMessage(out.hiddenBy)).toMatch(/Click here to bring it to the front/);
  });

  test("Censai's open chat over most of a small Browser window: hidden, says to move the window", () => {
    const small = box(800, 300, 300, 300);
    const { fit } = board([censaiButton(box(780, 220, 380, 560))]);
    const out = fit(small);
    expect(out).toEqual({ clear: false, hiddenBy: 'pinned' });
    expect(hiddenMessage(out.hiddenBy)).toMatch(/Move this window/);
  });

  test('a menu that is neither a window nor pinned still hides the page, as before', () => {
    const menu = node('menu', { parent: body, rect: box(105, 105, 120, 200) });
    const { fit } = board([menu]);
    expect(fit()).toEqual({ clear: false, hiddenBy: 'other' });
  });

  test("the window's own menus over its page still hide it", () => {
    const { el, doc } = board();
    const equip = node('equip-menu', { parent: el.parentElement, rect: box(500, 100, 200, 200) });
    doc.elementFromPoint = (x, y) => (x >= 500 && y <= 300 ? equip : el);
    expect(fitPane(el, PAGE, { clip: true, doc, positionOf })).toEqual({ clear: false, hiddenBy: 'other' });
  });

  test('group seams and corners marked passthrough never count as covering', () => {
    const seam = node('seam', { parent: body, attrs: ['data-pane-passthrough'], rect: box(390, 100, 20, 400) });
    const { fit } = board([seam]);
    expect(fit()).toEqual({ clear: true, rect: expect.objectContaining({ width: 600, height: 400 }) });
  });

  test('resize grips are still left uncovered', () => {
    const { fit } = board();
    const out = fit(PAGE, { grips: [box(686, 486, 14, 14)] });
    expect(out.clear).toBe(true);
    expect(out.rect.bottom).toBeLessThanOrEqual(486);
  });

  test('a window dragged partly off screen keeps its page; fully off screen hides', () => {
    const { fit } = board();
    expect(fit(box(-200, 100, 600, 400)).clear).toBe(true);
    expect(fit(box(-700, 100, 600, 400))).toEqual({ clear: false, hiddenBy: 'offscreen' });
  });

  test('the page hides once less than half of it would be left', () => {
    expect(MIN_SHOWN_SHARE).toBe(0.5);
    const { fit } = board([otherWindow(box(90, 90, 320, 420))]);
    expect(fit()).toEqual({ clear: false, hiddenBy: 'window' });
  });
});

describe('fitPane: covers smaller than the gap between probe points', () => {
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  test('a 250px window between two probe columns is still seen', () => {
    const small = box(130, 330, 250, 140);
    const { fit } = board([otherWindow(small)]);
    const out = fit();
    expect(out.clear).toBe(true);
    expect(out.trimmedBy).toBe('window');
    expect(overlaps(out.rect, small)).toBe(false);
  });

  test('a small floating window in the middle of a quadrant is still seen', () => {
    const floating = box(150, 150, 200, 130);
    const { fit } = board([otherWindow(floating)]);
    const out = fit();
    expect(out.clear).toBe(true);
    expect(overlaps(out.rect, floating)).toBe(false);
    expect(out.rect.width * out.rect.height).toBeGreaterThanOrEqual(600 * 400 * MIN_SHOWN_SHARE);
  });

  test('a window lying underneath the Browser does not cut the page', () => {
    const under = node('under-window', { parent: body, attrs: ['data-win-frame'], rect: box(150, 150, 200, 130) });
    const { fit } = board([], { marked: [under] });
    expect(fit()).toEqual({ clear: true, rect: expect.objectContaining({ width: 600, height: 400 }) });
  });

  test('a small toast pinned to the screen over the page is still seen', () => {
    const toast = box(300, 110, 200, 50);
    const { fit } = board([censaiButton(toast)]);
    const out = fit();
    expect(out.clear).toBe(true);
    expect(out.trimmedBy).toBe('pinned');
    expect(out.rect.top).toBeGreaterThanOrEqual(toast.bottom);
  });
});

describe('trimAround', () => {
  test('cuts the side that loses the least page, not the shallowest cut', () => {
    // A short, wide page with a corner cover 80 wide and 70 tall: a 70px strip
    // off the bottom would lose 42,000 px; an 80px strip off the right 16,000.
    const out = trimAround(box(0, 0, 600, 200), [box(520, 130, 80, 70)]);
    expect(out).toEqual(expect.objectContaining({ right: 520, bottom: 200 }));
  });

  test('leaves the page alone when nothing overlaps it', () => {
    expect(trimAround(box(0, 0, 600, 200), [box(700, 0, 50, 50)])).toEqual(expect.objectContaining({ width: 600, height: 200 }));
  });
});

describe('coverLogLine', () => {
  test('one plain line per state, nothing when the page simply shows', () => {
    expect(coverLogLine({ clear: true })).toBe('');
    expect(coverLogLine({ clear: true, trimmedBy: 'pinned' })).toMatch(/shrunk .* pinned to the screen/);
    expect(coverLogLine({ clear: true, trimmedBy: 'window' })).toMatch(/shrunk .* another window/);
    expect(coverLogLine({ clear: false, hiddenBy: 'window' })).toMatch(/hidden, another window/);
    expect(coverLogLine({ clear: false, hiddenBy: 'pinned' })).toMatch(/hidden, something pinned/);
    expect(coverLogLine({ clear: false, hiddenBy: 'other' })).toMatch(/hidden, a menu or panel/);
    expect(coverLogLine({ clear: false, hiddenBy: 'icon' })).toBe('');
  });
});

describe('gripRects', () => {
  const grip = (rect) => ({ getBoundingClientRect: () => rect, contains: (n) => n === 'grip' });
  test("a window's grips under the Browser no longer cut a strip off its page", () => {
    const reachable = grip(box(686, 486, 14, 14));
    const buried = grip(box(606, 300, 14, 14));
    const doc = {
      querySelectorAll: () => [reachable, buried],
      elementFromPoint: (x) => (x > 680 ? 'grip' : 'page'),
    };
    expect(gripRects(doc)).toEqual([box(686, 486, 14, 14)]);
  });
});
