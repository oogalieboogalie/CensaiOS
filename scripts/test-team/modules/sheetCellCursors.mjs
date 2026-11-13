// Live cursors in the Spreadsheet window (the board sheet with Research
// columns) for two people. Pat Example spawns a sheet with two made-up rows.
// Sam Example clicks into the second row's Company cell; Pat must see that
// cell outlined with Sam's name on it (and no other cell). Sam presses Tab;
// the name must move one cell right. Pat clicks into a cell too, and Sam must
// see Pat's name there. When Sam presses Escape, Sam's name leaves Pat's
// screen. Only the cell's spot goes out, never the words. All made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SHEET = {
  columns: [{ id: 'c0', name: 'Company' }, { id: 'c1', name: 'Notes' }],
  rows: [
    { id: 'r0', cells: { c0: { v: 'Rye flour' } } },
    { id: 'r1', cells: { c0: { v: 'Oven repair' } } },
    { id: 'r2', cells: {} },
  ],
};

const frame = (page, id) => windowFrame(page, id);
const cellWith = (page, id, words) => frame(page, id).locator('td.hb-sheet-cell', { hasText: words }).first();
const rowCell = (page, id, row, col) => frame(page, id).locator('tbody tr').nth(row).locator('td.hb-sheet-cell').nth(col);
const tagsIn = (loc, name) => loc.locator(`[data-teammate-cell="${name}"]`);
const allTags = (page, id, name) => frame(page, id).locator(`[data-teammate-cell="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

export default {
  id: 'sheetCellCursors',
  label: 'Spreadsheet: see which cell a teammate is typing in',
  async run(t) {
    const { pat, sam, check } = t;
    let win;

    await check('walk', 'A made-up sheet opens and both see its rows', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'sheets', { title: 'Made-up bakery list', sheet: SHEET }, { x: 40, y: 40 }, { w: 620, h: 360 });
      for (const p of [pat, sam]) await frame(p.page, win).getByText('Oven repair').waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-sheet');
      return 'Both see the same two rows';
    });

    await check('walk', "Sam clicks into a cell; Pat sees it outlined with Sam's name", async ({ shot }) => {
      await cellWith(sam.page, win, 'Oven repair').click();
      const ok = await waitFor(async () => (await tagsIn(rowCell(pat.page, win, 1, 0), 'Sam Example').count()) > 0, 15_000, pat.page);
      await pat.page.waitForTimeout(400);
      await sideBySide(t, 'pat-sees-sam-in-a-cell', shot);
      if (!ok) throw new Error("Pat sees no name for Sam on the Oven repair cell");
      if ((await allTags(pat.page, win, 'Sam Example').count()) !== 1) throw new Error("Sam's name shows on more than one cell");
      return "Pat sees Sam's name on the Oven repair cell only";
    });

    await check('walk', "Sam presses Tab; Sam's name moves one cell right on Pat's screen", async ({ shot }) => {
      await sam.page.keyboard.press('Tab');
      const ok = await waitFor(async () => (await tagsIn(rowCell(pat.page, win, 1, 1), 'Sam Example').count()) > 0
        && (await tagsIn(rowCell(pat.page, win, 1, 0), 'Sam Example').count()) === 0, 15_000, pat.page);
      await pat.page.waitForTimeout(400);
      await sideBySide(t, 'sams-name-moves', shot);
      if (!ok) throw new Error("Sam's name did not move to the Notes cell");
      return "Sam's name now sits on the Notes cell next to it";
    });

    await check('walk', "Pat clicks into a cell; Sam sees Pat's name there", async ({ shot }) => {
      await cellWith(pat.page, win, 'Rye flour').click();
      const ok = await waitFor(async () => (await tagsIn(rowCell(sam.page, win, 0, 0), 'Pat Example').count()) > 0, 15_000, sam.page);
      await sam.page.waitForTimeout(400);
      await sideBySide(t, 'both-see-each-other', shot);
      if (!ok) throw new Error("Sam sees no name for Pat on the Rye flour cell");
      return "Sam sees Pat's name on the Rye flour cell, Pat still sees Sam's on Notes";
    });

    await check('walk', "Sam presses Escape; Sam's name leaves Pat's screen", async ({ shot }) => {
      await sam.page.keyboard.press('Escape');
      const gone = await waitFor(async () => (await allTags(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-name-gone');
      if (!gone) throw new Error("Sam's name is still on Pat's screen");
      return "Sam's name is gone from Pat's screen";
    });
  },
};
