// Reloading never asks about unsaved changes that are not there. Pat Example
// opens a window from the Add menu and Sam Example sees it; reloading the
// board, three times for Pat and once for Sam, shows no "unsaved changes"
// bar and keeps the window. A Chat (which brings its agent to the board) is
// opened and closed with a reload straight after each, and pen colours are
// picked with a reload a moment later and straight after: never a bar, and
// the board and colour are as Pat left them. Bug hunt: with Pat's live link to the shared board cut (as when the server
// restarts), a window Pat adds reaches Sam once the link is back and the next
// reload shows no bar; a window added and never sent is offered back after a
// reload in one whole sentence (on a narrow window too, and again after a
// second reload), and Restore puts it on the board for Sam as well; and
// Sam's unsent window is offered only on the board it was made on, never on
// Sam's own board, and Discard lets it go.

import { openBoard, windowFrame } from '../../e2e/board.mjs';

const BAR = '[data-testid="draft-restore-bar"]';
const NORMAL = { width: 1440, height: 900 };
const NARROW = { width: 820, height: 700 };

/**
 * Opens a window from the Add menu the way a person does and gives it
 * `settle` ms before moving on; returns its id and kind.
 */
async function addFromMenu(page, name, { settle = 1200 } = {}) {
  const before = await page.evaluate(() => window.__e2eStore.getState().wins.map((w) => w.id));
  await page.mouse.click(1300, 120);
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.querySelector('.hb-palette-input')?.value === '', null, { timeout: 5_000 });
  await page.keyboard.type(name, { delay: 15 });
  await page.keyboard.press('Enter');
  const opened = (ids) => window.__e2eStore.getState().wins.find((w) => !ids.includes(w.id)) || null;
  await page.waitForFunction(opened, before, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(settle);
  const win = await page.evaluate(opened, before);
  return { id: win?.id || null, kind: win?.kind || null };
}

/** Picks a pen colour from the Tools, as a person does, and puts the brush down again. */
async function pickPenColor(page, name) {
  // The tools open under the pointer; the pen colours show while the brush is picked.
  await page.locator('#canvas-multitool-dock').getByText('Tools', { exact: true }).hover();
  await page.locator('button[data-tool="pen"]').click({ timeout: 5_000 });
  await page.locator(`button[title="Pen color ${name}"]`).click({ timeout: 5_000 });
  await page.locator('button[data-tool="select"]').click({ timeout: 5_000 });
  await page.mouse.move(1300, 120);
}

const hasWindow = (page, id) => page.evaluate((wid) => window.__e2eStore.getState().wins.some((w) => w.id === wid), id);
const seesWindow = (page, id, timeout) => page.waitForFunction(
  (wid) => window.__e2eStore.getState().wins.some((w) => w.id === wid), id, { timeout, polling: 250 },
).then(() => true, () => false);

/** The unsaved-changes copies this browser keeps (one per board). */
const keptCopies = (page) => page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('homebase.workspace.draft')));

async function reload(page, t, workspaceId = t.workspaceId) {
  await openBoard(page, workspaceId, t.web);
  await page.waitForTimeout(1500);
}

/** The bar's sentence, and whether all of it can be read: not cut off, not drawn over. */
const barView = (page) => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  if (!bar) return null;
  const text = bar.querySelector('span');
  const r = text.getBoundingClientRect();
  const cut = text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1
    || r.left < 0 || r.right > window.innerWidth;
  const over = [];
  for (const fx of [0.05, 0.5, 0.95]) {
    for (const fy of [0.25, 0.75]) {
      const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (el && !bar.contains(el)) over.push((el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 30));
    }
  }
  return { sentence: text.textContent.trim(), cut, over: [...new Set(over)], lines: Math.round(r.height / parseFloat(getComputedStyle(text).lineHeight)) };
}, BAR);

async function readableBar(page) {
  const v = await barView(page);
  if (!v) throw new Error('no bar offering the unsent window back');
  if (v.cut) throw new Error(`the bar's sentence is cut off: "${v.sentence}"`);
  if (v.over.length) throw new Error(`the bar's sentence is drawn over by ${v.over.map((o) => `"${o}"`).join(', ')}`);
  return v;
}

/**
 * A switch on one person's live link to the shared board. Off drops it the
 * way a server restart does and refuses it coming back; on lets it back.
 * It takes hold of the links opened after it is set up.
 */
async function linkSwitch(page) {
  const link = { off: false, open: new Set() };
  await page.routeWebSocket(/\/hocuspocus/, (ws) => {
    if (link.off) {
      ws.close();
      return;
    }
    ws.connectToServer();
    link.open.add(ws);
  });
  return {
    async off() {
      link.off = true;
      for (const ws of link.open) await ws.close().catch(() => {});
      link.open.clear();
      await page.waitForTimeout(800);
    },
    on() { link.off = false; },
  };
}

export default {
  id: 'unsavedChanges',
  label: 'Reloading and unsaved changes',
  async run(t) {
    const { pat, sam, check } = t;
    const page = pat.page;
    const patLink = await linkSwitch(pat.page);
    const samLink = await linkSwitch(sam.page);
    await Promise.all([reload(pat.page, t), reload(sam.page, t)]);

    await check('walk', 'after Pat adds a window from the Add menu, reloading (three times for Pat, once for Sam) never shows an "unsaved changes" bar and keeps the window', async ({ shot }) => {
      const { id, kind } = await addFromMenu(page, 'To-do list');
      if (kind !== 'todos') throw new Error(`the Add menu opened ${kind || 'nothing'}, not To-do list`);
      if (!await seesWindow(sam.page, id, 10_000)) throw new Error('Sam never saw the To-do list Pat added');
      for (let i = 1; i <= 3; i += 1) {
        await reload(page, t);
        if (await page.locator(BAR).count()) {
          await shot(page, `pat-reload-${i}-bar`);
          throw new Error(`reload ${i}: Pat sees a bar saying "${(await barView(page)).sentence}" though nothing was lost`);
        }
        if (!await hasWindow(page, id)) throw new Error(`reload ${i}: Pat's To-do list is gone`);
      }
      await reload(sam.page, t);
      await shot(page, 'pat-after-three-reloads');
      await shot(sam.page, 'sam-after-a-reload');
      if (await sam.page.locator(BAR).count()) throw new Error(`Sam sees a bar saying "${(await barView(sam.page)).sentence}" though nothing was lost`);
      if (!await hasWindow(sam.page, id)) throw new Error('Sam\'s To-do list is gone after a reload');
      const kept = await keptCopies(page);
      if (kept.length) throw new Error(`Pat's browser still keeps ${kept.length} unsaved-changes copy though everything was saved`);
      return 'no bar on any of Pat\'s three reloads or Sam\'s reload; the To-do list stayed on both screens and Pat\'s browser keeps no unsaved copy';
    });

    await check('walk', 'a Chat Pat opens, and then closes, never brings up the bar, even when Pat reloads straight after each', async ({ shot }) => {
      // A Chat brings its agent to the board, which is saved for the board's project as well.
      const { id, kind } = await addFromMenu(page, 'Chat', { settle: 0 });
      if (kind !== 'chat') throw new Error(`the Add menu opened ${kind || 'nothing'}, not Chat`);
      await reload(page, t);
      if (await page.locator(BAR).count()) {
        await shot(page, 'bar-after-opening-a-chat');
        throw new Error(`reloading straight after opening a Chat shows a bar saying "${(await barView(page)).sentence}"`);
      }
      if (!await hasWindow(page, id)) throw new Error('the Chat is gone after reloading straight after opening it');
      await windowFrame(page, id).locator('[data-window-control="close"]').click({ timeout: 5_000 });
      await windowFrame(page, id).waitFor({ state: 'detached', timeout: 5_000 });
      await reload(page, t);
      await shot(page, 'after-closing-a-chat-and-reloading-at-once');
      if (await page.locator(BAR).count()) throw new Error(`reloading straight after closing the Chat shows a bar saying "${(await barView(page)).sentence}"`);
      if (await hasWindow(page, id)) throw new Error('the closed Chat came back after the reload');
      if (await hasWindow(sam.page, id)) throw new Error('Sam still sees the Chat Pat closed');
      const kept = await keptCopies(page);
      if (kept.length) throw new Error(`Pat's browser still keeps ${kept.length} unsaved-changes copy though everything was saved`);
      return 'no bar after either reload; the Chat stayed after the first, was gone after the second (for Sam too), and Pat\'s browser keeps no unsaved copy';
    });

    await check('walk', 'a pen colour Pat picks is kept, whether Pat reloads a moment later or straight away, and no reload shows a bar', async ({ shot }) => {
      await pickPenColor(page, 'Blue');
      await page.waitForTimeout(2500);
      await reload(page, t);
      await shot(page, 'after-picking-blue-and-reloading');
      if (await page.locator(BAR).count()) throw new Error(`after picking a pen colour, the reload shows a bar saying "${(await barView(page)).sentence}"`);
      const blue = await page.evaluate(() => window.__e2eStore.getState().penColor);
      if (blue !== 'var(--canvas-pen-blue)') throw new Error(`the pen colour came back as ${blue}, not the blue Pat picked`);
      await pickPenColor(page, 'Green');
      await reload(page, t);
      await shot(page, 'after-picking-green-and-reloading-at-once');
      if (await page.locator(BAR).count()) throw new Error(`reloading straight after picking a pen colour shows a bar saying "${(await barView(page)).sentence}"`);
      const green = await page.evaluate(() => window.__e2eStore.getState().penColor);
      if (green !== 'var(--canvas-pen-green)') throw new Error(`reloading straight after picking green brought the pen back as ${green}`);
      const kept = await keptCopies(page);
      if (kept.length) throw new Error(`Pat's browser still keeps ${kept.length} unsaved-changes copy though the colour was saved`);
      return 'blue came back after a reload a moment later and green after a reload straight away, with no bar either time and no unsaved copy left';
    });

    await check('hunt', 'with Pat\'s live link cut, a window Pat adds reaches Sam once the link is back, and the next reload shows no bar', async ({ shot }) => {
      await patLink.off();
      const { id } = await addFromMenu(page, 'Calendar');
      if (await seesWindow(sam.page, id, 3_000)) throw new Error('the link was not really cut: Sam saw the Calendar at once');
      const keptWhileCut = await keptCopies(page);
      if (!keptWhileCut.length) throw new Error('while the link was cut, Pat\'s browser kept no copy of the unsent Calendar');
      patLink.on();
      if (!await seesWindow(sam.page, id, 45_000)) throw new Error('the Calendar never reached Sam after the link came back');
      await page.waitForTimeout(1500);
      const kept = await keptCopies(page);
      if (kept.length) throw new Error('once the Calendar reached the board, Pat\'s browser still kept its unsaved copy');
      await reload(page, t);
      await shot(page, 'after-the-link-came-back-and-a-reload');
      if (await page.locator(BAR).count()) throw new Error(`the reload shows a bar saying "${(await barView(page)).sentence}" though the Calendar reached the board`);
      if (!await hasWindow(page, id)) throw new Error('the Calendar is gone after the reload');
      return 'Sam did not see the Calendar while the link was cut and Pat\'s browser kept a copy; once the link was back Sam saw it, the copy went, and the reload showed no bar';
    });

    await check('hunt', 'a window that never reached the server is offered back after a reload in a whole sentence, also on a narrow window and after a second reload, and Restore puts it on the board for Sam too', async ({ shot }) => {
      await patLink.off();
      const { id } = await addFromMenu(page, 'Chat');
      if (await seesWindow(sam.page, id, 3_000)) throw new Error('the link was not really cut: Sam saw the Chat at once');
      await reload(page, t);
      if (await hasWindow(page, id)) throw new Error('the unsent Chat came back by itself, so this proves nothing');
      await page.locator(BAR).waitFor({ timeout: 5_000 }).catch(() => {});
      await shot(page, 'unsent-window-offered-back');
      const v = await readableBar(page);
      await page.setViewportSize(NARROW);
      try {
        await page.waitForTimeout(400);
        await shot(page, 'offered-back-on-a-narrow-window');
        const narrow = await readableBar(page);
        if (narrow.sentence !== v.sentence) throw new Error('the bar says something else on a narrow window');
      } finally {
        await page.setViewportSize(NORMAL);
        await page.waitForTimeout(400);
      }
      await reload(page, t);
      if (!await page.locator(BAR).count()) throw new Error('after a second reload without choosing, the unsent Chat is no longer offered');
      await page.getByRole('button', { name: 'Restore them', exact: true }).click({ timeout: 5_000 });
      await page.waitForTimeout(600);
      if (!await hasWindow(page, id)) throw new Error('Restore did not put the Chat back on Pat\'s board');
      if (await page.locator(BAR).count()) throw new Error('the bar stayed after Restore');
      patLink.on();
      if (!await seesWindow(sam.page, id, 45_000)) throw new Error('the restored Chat never reached Sam');
      await page.waitForTimeout(1500);
      await reload(page, t);
      await shot(page, 'restored-and-reloaded');
      if (await page.locator(BAR).count()) throw new Error('after Restore, the next reload offered the Chat again');
      return `the bar said "${v.sentence}" in full (${v.lines} line${v.lines === 1 ? '' : 's'}, and in full on an 820 wide window), was still there after a second reload, and Restore put the Chat back for Pat and Sam; the next reload showed no bar`;
    });

    await check('hunt', 'Sam\'s unsent window is offered only on the board it was made on, not on Sam\'s own board, and Discard lets it go', async ({ shot }) => {
      const own = await t.api(sam, 'POST', '/api/workspaces/personal');
      const ownBoard = own.body?.workspace?.id;
      if (!ownBoard || ownBoard === t.workspaceId) throw new Error(`Sam's own board could not be found (${own.status})`);
      await samLink.off();
      const { id } = await addFromMenu(sam.page, 'Chat');
      if (await seesWindow(page, id, 3_000)) throw new Error('the link was not really cut: Pat saw Sam\'s Chat at once');
      await reload(sam.page, t, ownBoard);
      await shot(sam.page, 'sams-own-board');
      if (await sam.page.locator(BAR).count()) throw new Error(`Sam's own board offers back the Chat made on the shared board: "${(await barView(sam.page)).sentence}"`);
      await reload(sam.page, t);
      await shot(sam.page, 'back-on-the-shared-board');
      await readableBar(sam.page);
      await sam.page.getByRole('button', { name: 'Discard', exact: true }).click({ timeout: 5_000 });
      await sam.page.waitForTimeout(400);
      samLink.on();
      await reload(sam.page, t);
      if (await sam.page.locator(BAR).count()) throw new Error('after Discard, the next reload offered the Chat again');
      if (await hasWindow(sam.page, id) || await hasWindow(page, id)) throw new Error('the discarded Chat is on the board anyway');
      return 'Sam\'s own board showed no bar; back on the shared board the unsent Chat was offered, Discard let it go, and the next reload showed no bar';
    });
  },
};
