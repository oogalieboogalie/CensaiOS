// Live cursors in Writer table cells for two people. Pat Example adds a
// table to a made-up price list and fills in a cell; Sam Example clicks into
// that cell and puts the cursor after "Rye". Pat, typing in the same cell,
// sees a line with Sam's name at that spot, and when Pat types in front of
// it the line moves with Sam's words. Sam's line never shows in another
// cell. When Sam clicks away, it leaves Pat's screen. Nothing is written by
// the AI, so no key is needed. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Rye bread';
const SPOT = 'Rye'.length;
const PAT_WORDS = 'Fresh ';

const cell = (page, id, r, c) => windowFrame(page, id).getByLabel(`Row ${r} column ${c}`, { exact: true });
const lineIn = (box, name) => box.locator('xpath=..').locator(`.hb-text-caret[data-teammate-caret="${name}"]`);
const atOf = async (loc) => ((await loc.count()) ? loc.first().getAttribute('data-at') : null);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

export default {
  id: 'writerCellCursors',
  label: "Writer: see a teammate's cursor in a table cell",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat adds a table and fills in a cell; Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeDocs', { title: 'Made-up price list' }, { x: 40, y: 40 }, { w: 820, h: 560 });
      await windowFrame(pat.page, win).getByRole('button', { name: 'Table' }).click({ timeout: 15_000 });
      await cell(pat.page, win, 2, 1).fill(WORDS, { timeout: 15_000 });
      const ok = await waitFor(async () => (await cell(sam.page, win, 2, 1).inputValue().catch(() => '')) === WORDS, 15_000, pat.page);
      await shot(sam.page, 'sam-sees-the-table');
      if (!ok) throw new Error("Sam's cell does not match");
      return 'Sam has the same table';
    });

    await check('walk', "Sam puts the cursor after 'Rye'; Pat sees Sam's line and name at that letter, only in that cell", async ({ shot }) => {
      const samBox = cell(sam.page, win, 2, 1);
      await samBox.evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await samBox.press('Shift');
      const patBox = cell(pat.page, win, 2, 1);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      const seen = await waitFor(async () => ((await atOf(lineIn(patBox, 'Sam Example'))) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor-in-the-cell', shot);
      if (!seen) throw new Error(`Pat sees Sam's line at ${(await atOf(lineIn(patBox, 'Sam Example'))) ?? 'nowhere'}, not ${SPOT}`);
      if (await lineIn(cell(pat.page, win, 2, 2), 'Sam Example').count()) throw new Error("Sam's line also shows in the next cell");
      return "Pat sees Sam's line right after \"Rye\", and nowhere else";
    });

    await check('walk', "Pat types in front of it; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = cell(pat.page, win, 2, 1);
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await atOf(lineIn(patBox, 'Sam Example'))) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's line sits at ${await atOf(lineIn(patBox, 'Sam Example'))}, not ${want}`);
      if (!(await lineIn(cell(sam.page, win, 2, 1), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return `Sam's line still sits after "Rye" (now letter ${want}), and Sam sees Pat's`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await cell(sam.page, win, 2, 1).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await lineIn(cell(pat.page, win, 2, 1), 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
