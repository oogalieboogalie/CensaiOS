// The Board map keeps out of the way. Pat Example opens Image Studio, too big
// to fit beside the map: it opens in the middle as before and the map tucks
// into its small Map tab instead of covering its corner. Then Pat opens Chat,
// To-do list and Calendar from the Add menu and none opens under the map; Pat
// drags the Calendar under the map and it tucks, then comes back when the
// Calendar moves away. Bug hunt: the corner of a window where the map was
// takes a click, the Map tab still opens the map on demand, and dragging on
// the map to slide the board keeps it open while windows pass under it. One
// person is enough here.

import { windowFrame } from '../../e2e/board.mjs';

const ADDS = [['Chat', 'chat'], ['To-do list', 'todos'], ['Calendar', 'calendar']];
const FULL = '[data-testid="board-map"]';
const TUCKED = '[data-testid="board-map-tab"][data-tucked="true"]';

const rectOf = (page, testId) => page.evaluate((id) => {
  const el = document.querySelector(`[data-testid="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}, testId);

const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The kind of a window sitting under the open map right now, or null. */
const windowUnderMap = (page) => page.evaluate(() => {
  const map = document.querySelector('[data-testid="board-map"]')?.getBoundingClientRect();
  if (!map) return null;
  for (const w of window.__e2eStore.getState().wins) {
    const r = document.querySelector(`[data-win-id="${w.id}"]`)?.getBoundingClientRect();
    if (r && r.left < map.right && r.right > map.left && r.top < map.bottom && r.bottom > map.top) return w.kind;
  }
  return null;
});
const panOf = (page) => page.evaluate(() => ({ ...window.__e2eStore.getState().pan }));

/** Opens a window from the Add menu the way a person does; returns its id and kind. */
async function addFromMenu(page, name) {
  await page.mouse.click(1300, 120);
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.querySelector('.hb-palette-input')?.value === '', null, { timeout: 5_000 });
  await page.keyboard.type(name, { delay: 15 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const s = window.__e2eStore.getState();
    return { id: s.activeId, kind: s.wins.find((w) => w.id === s.activeId)?.kind || null };
  });
}

// What a press on a window header does not move the window by (its buttons and fields).
const CONTROLS = 'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="menu"], [contenteditable="true"], [data-no-drag]';

/** A free spot on the window's header, not on one of its buttons, where a person grabs it to move it. */
const grabPoint = (page, id) => page.evaluate(([winId, controls]) => {
  const header = document.querySelector(`[data-win-id="${winId}"] .hb-win-header`);
  if (!header) return null;
  const r = header.getBoundingClientRect();
  const y = r.top + r.height / 2;
  for (let x = r.left + 6; x < r.right - 6; x += 4) {
    const el = document.elementFromPoint(x, y);
    if (el && header.contains(el) && !el.closest(controls)) return { x, y };
  }
  return null;
}, [id, CONTROLS]);

/** A spot inside `rect` on the window itself, away from its buttons, where a person clicks. */
const quietSpot = (page, id, rect) => page.evaluate(([winId, area, controls]) => {
  const frame = document.querySelector(`[data-win-id="${winId}"]`);
  for (let y = area.y + 10; y < area.y + area.h - 10; y += 8) {
    for (let x = area.x + area.w - 10; x > area.x + 10; x -= 8) {
      const el = document.elementFromPoint(x, y);
      if (el && frame?.contains(el) && !el.closest(controls)) return { x, y };
    }
  }
  return null;
}, [id, rect, CONTROLS]);

/** Drags a window by a free spot on its header so its top-left lands at (x, y) on screen. */
async function dragTo(page, id, x, y) {
  const box = await windowFrame(page, id).boundingBox();
  const from = await grabPoint(page, id);
  if (!from || from.y < 0 || from.x < 0) throw new Error('no free spot on the window\'s header to grab');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(from.x + ((x - box.x) * i) / 12, from.y + ((y - box.y) * i) / 12);
  await page.mouse.up();
}

export default {
  id: 'boardMap',
  label: 'The Board map keeps out of the way',
  async run(t) {
    const { pat, check } = t;
    const page = pat.page;

    await check('walk', 'Image Studio, too big to fit beside the Board map, opens as before and the map tucks into its tab', async ({ shot }) => {
      const pan = await panOf(page);
      const { id, kind } = await addFromMenu(page, 'Image Studio');
      if (kind !== 'imageStudio') throw new Error(`the Add menu opened ${kind || 'nothing'}, not Image Studio`);
      await page.waitForTimeout(600);
      const now = await panOf(page);
      const tab = await page.locator(TUCKED).count();
      const full = await page.locator(FULL).count();
      await shot(page, 'big-window-map-tucked');
      if (now.x !== pan.x || now.y !== pan.y) throw new Error('the board moved to make room for it');
      if (!tab || full) throw new Error(`with Image Studio under it the map is ${full ? 'still open over its corner' : 'gone'}`);
      await windowFrame(page, id).locator('[data-window-control="close"]').click();
      await windowFrame(page, id).waitFor({ state: 'detached', timeout: 5_000 });
      return 'Image Studio opened in the middle without moving the board, and the map sat as its small Map tab instead of over its corner';
    });

    await check('walk', 'Chat, To-do list and Calendar opened from the Add menu all open clear of the Board map', async ({ shot }) => {
      t.added = [];
      for (const [name, kind] of ADDS) {
        const win = await addFromMenu(page, name);
        if (win.kind !== kind) throw new Error(`the Add menu opened ${win.kind || 'nothing'} for ${name}`);
        t.added.push(win.id);
      }
      const map = await rectOf(page, 'board-map');
      await shot(page, 'three-windows-clear-of-the-map');
      if (!map) throw new Error('the full Board map is not showing after three windows');
      const under = [];
      for (const [i, id] of t.added.entries()) {
        const box = await windowFrame(page, id).boundingBox();
        if (!box) throw new Error(`${ADDS[i][0]} did not open`);
        if (hits({ x: box.x, y: box.y, w: box.width, h: box.height }, map)) under.push(ADDS[i][0]);
      }
      if (under.length) throw new Error(`opened under the map: ${under.join(', ')}`);
      return `${ADDS.map(([name]) => name).join(', ')} all opened clear of the map, and the map stayed open`;
    });

    await check('walk', 'a window dragged under the Board map tucks it into its tab; dragged away, the map comes back', async ({ shot }) => {
      const id = t.added?.[2];
      if (!id) throw new Error('no Calendar to drag');
      t.dragged = id;
      t.home = await windowFrame(page, id).boundingBox();
      const map = await rectOf(page, 'board-map');
      await dragTo(page, id, map.x + 40, map.y + 60 - t.home.height);
      await page.waitForTimeout(700);
      const tab = await page.locator(TUCKED).count();
      const full = await page.locator(FULL).count();
      await shot(page, 'window-under-the-map-map-tucked');
      if (!tab || full) throw new Error(`with a window under it the map is ${full ? 'still open' : 'gone'}`);
      t.mapBox = map;
      await dragTo(page, id, t.home.x, t.home.y);
      await page.locator(FULL).waitFor({ timeout: 5_000 });
      await page.waitForTimeout(300);
      await shot(page, 'window-moved-away-map-back');
      return 'the map tucked into its Map tab while the Calendar sat under it, and came back once it moved away';
    });

    await check('hunt', 'the corner of a window where the map was takes a click', async ({ shot }) => {
      const id = t.dragged;
      const map = t.mapBox;
      if (!id || !map) throw new Error('no window to drag');
      await dragTo(page, id, map.x + 40, map.y + 60 - t.home.height);
      await page.waitForTimeout(700);
      await page.mouse.click(1300, 120);
      await page.waitForTimeout(300);
      const spot = await quietSpot(page, id, map);
      if (!spot) throw new Error('the Calendar is not under the map\'s spot');
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(400);
      const now = await page.evaluate(() => window.__e2eStore.getState().activeId);
      await shot(page, 'click-where-the-map-was');
      if (now !== id) throw new Error(`a click where the map sits went to ${now ? 'another window' : 'nothing'}, not the Calendar under it`);
      return `a click at ${Math.round(spot.x)},${Math.round(spot.y)}, inside the map's spot, picked the Calendar under it`;
    });

    await check('hunt', 'with a window under it, the Map tab still opens the map', async ({ shot }) => {
      await page.locator(TUCKED).click({ timeout: 5_000 });
      await page.locator(FULL).waitFor({ timeout: 5_000 });
      await page.waitForTimeout(300);
      await shot(page, 'map-opened-from-its-tab');
      await page.waitForTimeout(500);
      const still = await page.locator(FULL).count();
      if (!still) throw new Error('the map opened, then tucked itself away again');
      return 'one click on the Map tab opened the map, and it stayed open';
    });

    await check('hunt', 'sliding the board by dragging on the map keeps the map open while windows pass under it', async ({ shot }) => {
      await dragTo(page, t.dragged, t.home.x, t.home.y);
      await page.waitForTimeout(700);
      const svg = await page.locator(`${FULL} svg`).boundingBox();
      if (!svg) throw new Error('the full map is not showing after the Calendar moved back');
      const from = { x: svg.x + svg.width / 2, y: svg.y + svg.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      let under = null;
      let gone = false;
      for (let i = 1; i <= 12; i += 1) {
        await page.mouse.move(from.x + ((svg.width / 2 - 4) * i) / 12, from.y - ((svg.height / 2 - 4) * i) / 12);
        await page.waitForTimeout(60);
        if (!(await page.locator(FULL).count())) gone = true;
        else if (!under && (under = await windowUnderMap(page))) await shot(page, 'sliding-the-board-from-the-map');
      }
      await page.mouse.up();
      if (gone) throw new Error('the map tucked away in the middle of the drag');
      if (!under) throw new Error('no window passed under the map while sliding, so this proves nothing');
      await page.mouse.move(1300, 120);
      await page.waitForTimeout(700);
      const tucked = await page.locator(TUCKED).count();
      const left = await windowUnderMap(page);
      if (!tucked && left) throw new Error(`once the pointer left, the map stayed over the ${left} window`);
      return `the map stayed open through the whole drag while the ${under} window slid under it${tucked ? ', and tucked away once the pointer left' : ''}`;
    });
  },
};
