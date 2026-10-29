// The empty board's welcome sits where you can see it. Pat Example clears
// the board and finds the welcome ("Welcome to censaiOS.", the starting
// buttons, the tips and the ready-made boards) in full view: on a brand-new
// board, after opening Chat from it, scrolling the board and closing Chat,
// after a reload, zoomed out, and on a small laptop window, never under the
// top bar or the tools. Bug hunt: on a very short window it shrinks to fit,
// its tips for moving and zooming do what they say, picking the brush clears
// it away so the board is free to draw on, Sam Example looking somewhere else
// on the shared board sees it in full view once Pat closes the last window,
// and a ready-made board chip opens that board in the template picker.

import { openBoard, windowFrame } from '../../e2e/board.mjs';

const PAD = '[data-testid="canvas-launchpad"]';
const SMALL = { width: 1280, height: 600 };
const SHORT = { width: 1280, height: 480 };
const NORMAL = { width: 1440, height: 900 };

/** Where the welcome sits on screen, which edges cut it off, and which screen buttons cover it. */
const welcomeView = (page) => page.evaluate((sel) => {
  const pad = document.querySelector(sel);
  if (!pad) return null;
  const r = pad.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const root = document.getElementById('canvas-root');
  // What sits fixed on the screen over the board: the top bar, the tools, the zoom buttons.
  const furniture = [...document.querySelectorAll('body *')].filter((el) => {
    if (root?.contains(el) || el.closest('[data-pane-cover]')) return false;
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.width < W * 0.9 && b.height < H * 0.9;
  }).map((el) => {
    const b = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 24);
    return { name, x: b.left, y: b.top, w: b.width, h: b.height };
  });
  const box = { x: r.left, y: r.top, w: r.width, h: r.height };
  const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  return {
    box,
    natural: { w: pad.offsetWidth, h: pad.offsetHeight },
    off: [box.x < 0 && 'left', box.y < 0 && 'top', box.x + box.w > W && 'right', box.y + box.h > H && 'bottom'].filter(Boolean),
    under: [...new Set(furniture.filter((f) => hits(box, f)).map((f) => f.name))],
  };
}, PAD);

const where = (v) => `x ${Math.round(v.box.x)} to ${Math.round(v.box.x + v.box.w)}, y ${Math.round(v.box.y)} to ${Math.round(v.box.y + v.box.h)}`;

/** Throws unless the whole welcome is on screen at its normal size and nothing fixed covers it. */
async function inFullView(page, { sizeMatters = true } = {}) {
  const v = await welcomeView(page);
  if (!v) throw new Error('the welcome is not on the empty board');
  if (v.off.length) throw new Error(`the welcome is cut off at the ${v.off.join(' and ')} edge (${where(v)})`);
  if (v.under.length) throw new Error(`part of the welcome is under ${v.under.map((n) => `"${n}"`).join(', ')} (${where(v)})`);
  if (sizeMatters && v.box.w < v.natural.w * 0.95) {
    throw new Error(`the welcome shows at ${Math.round((100 * v.box.w) / v.natural.w)}% of its size, hard to read`);
  }
  return v;
}

const view = (page) => page.evaluate(() => {
  const s = window.__e2eStore.getState();
  return { pan: { ...s.pan }, zoom: s.zoom, wins: s.wins.length, paths: s.paths.length };
});

/** Reloads the board; `fresh` also forgets where this browser last looked, like a first visit. */
async function reopen(page, t, { fresh = false } = {}) {
  if (fresh) await page.evaluate(() => window.localStorage.removeItem('homebase.camera.v1'));
  await openBoard(page, t.workspaceId, t.web);
  await page.waitForTimeout(600);
}

/** Opens Chat from the welcome's own button; returns its id. */
async function chatFromWelcome(page) {
  await page.locator(PAD).getByRole('button', { name: 'Chat with Censai', exact: true }).click({ timeout: 5_000 });
  await page.waitForFunction(() => window.__e2eStore.getState().wins.some((w) => w.kind === 'chat'), null, { timeout: 5_000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => window.__e2eStore.getState().wins.find((w) => w.kind === 'chat').id);
}

async function closeWindow(page, id) {
  await windowFrame(page, id).locator('[data-window-control="close"]').click({ timeout: 5_000 });
  await windowFrame(page, id).waitFor({ state: 'detached', timeout: 5_000 });
  await page.waitForTimeout(500);
}

/** A spot on the bare board (no window, welcome or button on it), nearest the top left. */
const bareSpot = (page) => page.evaluate(() => {
  for (let y = 160; y < window.innerHeight - 120; y += 40) {
    for (let x = 120; x < window.innerWidth - 120; x += 40) {
      if (document.elementFromPoint(x, y)?.hasAttribute('data-canvas-bg')) return { x, y };
    }
  }
  const el = document.elementFromPoint(120, 160);
  return { none: `${el?.tagName} ${el?.className?.baseVal ?? el?.className} ${el?.getAttribute('data-testid') || ''}`.trim() };
});

/** The mouse wheel over a bare spot of the board, with keys held if asked. */
async function wheel(page, dx, dy, keys = []) {
  const at = await bareSpot(page);
  if (at.none) throw new Error(`no bare spot on the board to scroll on (${at.none} on top)`);
  await page.mouse.move(at.x, at.y);
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.wheel(dx, dy);
  for (const key of keys) await page.keyboard.up(key);
  await page.waitForTimeout(300);
}

async function drag(page, from, to, keys = [], button = 'left') {
  await page.mouse.move(from.x, from.y);
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.down({ button });
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await page.mouse.up({ button });
  for (const key of keys) await page.keyboard.up(key);
  await page.waitForTimeout(300);
}

// Each way the welcome's tips can say to move or zoom, and how a person does it.
const FROM = { x: 260, y: 640 };
const TO = { x: 420, y: 720 };
const GESTURES = [
  { says: /space \+ drag/i, name: 'Space + drag', moves: 'pan', run: (page) => drag(page, FROM, TO, ['Space']) },
  { says: /alt \+ drag/i, name: 'Alt + drag', moves: 'pan', run: (page) => drag(page, FROM, TO, ['Alt']) },
  { says: /middle/i, name: 'middle-click + drag', moves: 'pan', run: (page) => drag(page, FROM, TO, [], 'middle') },
  { says: /ctrl ?\+ ?scroll/i, name: 'Ctrl + scroll', moves: 'zoom', run: (page) => wheel(page, 0, -120, ['Control']) },
  { says: /\bscroll\b/i, name: 'scroll', moves: 'pan', run: (page) => wheel(page, 0, 160) },
  { says: /\bdrag\b/i, name: 'click and drag', moves: 'pan', run: (page) => drag(page, FROM, TO) },
];

/** The gestures one tip names: "scroll or Space + drag" names two, "Ctrl + scroll" one. */
function gesturesIn(tip) {
  return tip.split(/\bor\b|·/).map((part) => part.trim()).filter(Boolean)
    .map((part) => GESTURES.find((g) => g.says.test(part)))
    .filter(Boolean);
}

export default {
  id: 'emptyBoard',
  label: 'The empty board welcome sits in full view',
  async run(t) {
    const { pat, sam, check } = t;
    const page = pat.page;

    await check('walk', 'a brand-new board shows the welcome in full view, clear of the top bar and the tools', async ({ shot }) => {
      await reopen(page, t, { fresh: true });
      await shot(page, 'brand-new-board');
      const v = await inFullView(page);
      return `the whole welcome shows at ${where(v)} on a 1440 by 900 screen`;
    });

    await check('walk', 'after opening Chat from the welcome, scrolling the board and closing Chat, the welcome is back in full view', async ({ shot }) => {
      const id = await chatFromWelcome(page);
      await wheel(page, -500, -400);
      const moved = await view(page);
      await closeWindow(page, id);
      await shot(page, 'after-closing-the-last-window');
      const v = await inFullView(page);
      return `the board moved to ${Math.round(moved.pan.x)},${Math.round(moved.pan.y)}; once Chat closed, the whole welcome showed at ${where(v)}`;
    });

    await check('walk', 'a reload of that board keeps the welcome in full view', async ({ shot }) => {
      await reopen(page, t);
      await shot(page, 'after-a-reload');
      const v = await inFullView(page);
      return `after the reload the whole welcome showed at ${where(v)}`;
    });

    await check('walk', 'zoomed out, the welcome still shows at its normal size, in full view', async ({ shot }) => {
      const id = await chatFromWelcome(page);
      await wheel(page, 0, 100, ['Control']);
      await wheel(page, 0, 100, ['Control']);
      const { zoom } = await view(page);
      if (zoom > 0.75) throw new Error(`Ctrl + scroll only zoomed out to ${Math.round(zoom * 100)}%`);
      await closeWindow(page, id);
      await shot(page, 'zoomed-out');
      const v = await inFullView(page);
      return `at ${Math.round(zoom * 100)}% zoom the welcome showed at its normal size, ${where(v)}`;
    });

    await check('walk', 'on a small laptop window (1280 by 600) the whole welcome fits between the top bar and the tools', async ({ shot }) => {
      await page.setViewportSize(SMALL);
      try {
        await reopen(page, t, { fresh: true });
        await shot(page, 'small-laptop-window');
        const v = await inFullView(page, { sizeMatters: false });
        return `on a 1280 by 600 window the whole welcome showed at ${where(v)}`;
      } finally {
        await page.setViewportSize(NORMAL);
        await page.waitForTimeout(400);
      }
    });

    await check('hunt', 'on a very short window (1280 by 480) the welcome shrinks to fit instead of running under the top bar or the tools', async ({ shot }) => {
      await page.setViewportSize(SHORT);
      try {
        // The bar offering an unsaved draft back would sit over the welcome's top on a window this short.
        const discard = page.getByRole('button', { name: 'Discard', exact: true });
        if (await discard.count()) await discard.first().click();
        await page.waitForTimeout(600);
        await shot(page, 'very-short-window');
        const v = await inFullView(page, { sizeMatters: false });
        const size = Math.round((100 * v.box.w) / v.natural.w);
        if (size > 99) throw new Error('the welcome did not need to shrink, so this proves nothing');
        return `on a 1280 by 480 window the welcome shrank to ${size}% and showed whole at ${where(v)}`;
      } finally {
        await page.setViewportSize(NORMAL);
        await page.waitForTimeout(400);
      }
    });

    await check('hunt', 'the welcome\'s tips for moving and zooming the board do what they say', async ({ shot }) => {
      const tips = await page.locator(PAD).evaluate((pad) => [...pad.querySelectorAll('div')]
        .filter((el) => !el.children.length && /drag|scroll/i.test(el.textContent))
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim()));
      if (!tips.length) throw new Error('the welcome has no tips for moving around');
      const bare = await bareSpot(page);
      if (bare.none) throw new Error(`no bare spot on the board to click (${bare.none} on top)`);
      await page.mouse.click(bare.x, bare.y);
      const tried = [];
      for (const tip of tips) {
        for (const gesture of gesturesIn(tip)) {
          const before = await view(page);
          await gesture.run(page);
          const after = await view(page);
          const moved = gesture.moves === 'zoom'
            ? Math.abs(after.zoom - before.zoom) > 0.01
            : Math.hypot(after.pan.x - before.pan.x, after.pan.y - before.pan.y) > 20;
          if (!moved) throw new Error(`the tip "${tip}" says ${gesture.name} ${gesture.moves === 'zoom' ? 'zooms' : 'moves the board'}, but it did not`);
          tried.push(gesture.name);
        }
      }
      await shot(page, 'after-following-the-tips');
      await inFullView(page);
      return `tips: ${tips.map((tip) => `"${tip}"`).join(', ')}; ${[...new Set(tried)].join(', ')} each did what the tip says, and the welcome stayed in full view`;
    });

    await check('hunt', 'picking the brush clears the welcome away; a drawing keeps it away, and erasing the drawing brings it back', async ({ shot }) => {
      await page.keyboard.press('Escape');
      const bare = await bareSpot(page);
      if (bare.none) throw new Error(`no bare spot on the board to click (${bare.none} on top)`);
      await page.mouse.click(bare.x, bare.y);
      await page.keyboard.press('p');
      await page.waitForTimeout(400);
      await shot(page, 'brush-picked');
      if (await page.locator(PAD).count()) throw new Error('with the brush picked, the welcome still covers the middle of the board');
      await drag(page, { x: 560, y: 420 }, { x: 880, y: 500 });
      const drawn = await view(page);
      if (!drawn.paths) throw new Error('a line drawn across the middle of the board did not land');
      await page.keyboard.press('v');
      await page.waitForTimeout(400);
      await shot(page, 'a-drawing-on-the-board');
      if (await page.locator(PAD).count()) throw new Error('the welcome came back over the drawing');
      await page.keyboard.press('e');
      await page.waitForTimeout(200);
      await drag(page, { x: 720, y: 360 }, { x: 720, y: 560 });
      const erased = await view(page);
      if (erased.paths) throw new Error('the eraser did not take the line away');
      await page.keyboard.press('v');
      await page.locator(PAD).waitFor({ timeout: 5_000 });
      await shot(page, 'welcome-back-after-erasing');
      await inFullView(page);
      return 'the welcome stepped aside for the brush, a line drew straight across the middle of the board, and the welcome came back in full view once the line was erased';
    });

    await check('hunt', 'Sam, looking somewhere else on the shared board, sees the welcome in full view when Pat closes the last window', async ({ shot }) => {
      const id = await chatFromWelcome(page);
      await sam.page.waitForFunction((wid) => window.__e2eStore.getState().wins.some((w) => w.id === wid), id, { timeout: 10_000 });
      await wheel(sam.page, -900, 700);
      await closeWindow(page, id);
      await sam.page.waitForFunction(() => window.__e2eStore.getState().wins.length === 0, null, { timeout: 10_000 });
      await sam.page.waitForTimeout(500);
      await shot(sam.page, 'sam-sees-the-welcome');
      const v = await inFullView(sam.page);
      return `Sam had scrolled far away; once Pat closed Chat, Sam's whole welcome showed at ${where(v)}`;
    });

    await check('walk', 'a ready-made board chip on the welcome opens that board in the template picker', async ({ shot }) => {
      await page.locator('[data-testid="launchpad-board-small-business"]').click({ timeout: 5_000 });
      await page.locator('[data-testid="template-dialog"]').waitFor({ timeout: 5_000 });
      await page.locator('[data-testid="template-tab-small-business"][aria-pressed="true"]').waitFor({ timeout: 10_000 });
      await shot(page, 'small-business-picked');
      await page.keyboard.press('Escape');
      await page.locator('[data-testid="template-dialog"]').waitFor({ state: 'detached', timeout: 5_000 });
      return 'the Small Business chip opened the template picker on Small Business, and Escape closed it';
    });
  },
};
