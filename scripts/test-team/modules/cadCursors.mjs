// Live cursors in a YorWare CAD recipe for two people. Pat Example starts a
// made-up part and Sam Example sees it. Both open the recipe; Sam puts the
// cursor right before "function main". Pat must see a line with Sam's name
// there, and when Pat types a note at the top (unsaved, not yet Run) the
// line must still sit before "function main" in Pat's copy. Sam sees Pat's
// cursor too. When Sam leaves the box, Sam's line leaves Pat's screen.
// All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const NOTE = '// Pat: made-up note\n';
const ANCHOR = 'function main';

const boxOf = (page, id) => windowFrame(page, id).getByLabel('Recipe code');
const markOf = (page, id, name) => windowFrame(page, id).locator(`[data-teammate-caret="${name}"]`);
const recipeOf = async (page, id) => String((await readWindow(page, id))?.cadCode || '');

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function openRecipe(page, id) {
  if (!(await boxOf(page, id).count())) {
    await windowFrame(page, id).getByRole('button', { name: 'Show the code that makes this part' }).click({ timeout: 15_000 });
  }
  await boxOf(page, id).waitFor({ timeout: 10_000 });
  return boxOf(page, id);
}

const markAt = async (page, id, name) => {
  const m = markOf(page, id, name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'cadCursors',
  label: "CAD: see a teammate's cursor in the recipe",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(NOTE.trim());
    let win;
    let start = '';

    await check('walk', 'Pat starts a made-up part and Sam sees the same recipe', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'yorCad', { title: 'Made-up part' }, { x: 40, y: 40 }, { w: 900, h: 600 });
      await windowFrame(pat.page, win).getByRole('button', { name: /Rounded block/ }).click({ timeout: 15_000 });
      start = await waitFor(async () => {
        const [a, b] = [await recipeOf(pat.page, win), await recipeOf(sam.page, win)];
        return a.includes(ANCHOR) && a === b ? a : '';
      }, 15_000, pat.page);
      await shot(sam.page, 'sam-sees-the-part');
      if (!start) throw new Error('Sam does not have the same recipe');
      return 'Sam has the same recipe';
    });

    await check('walk', `Sam puts the cursor before "${ANCHOR}"; Pat sees Sam's name there`, async ({ shot }) => {
      const spot = start.indexOf(ANCHOR);
      const patBox = await openRecipe(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.press('Shift');
      const samBox = await openRecipe(sam.page, win);
      await samBox.evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, spot);
      await samBox.press('Shift');
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(spot) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!ok) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${spot}`);
      if (!(await markOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return `Pat sees a line with Sam's name right before "${ANCHOR}", and Sam sees Pat's`;
    });

    await check('walk', "Pat types a note at the top without running it; Sam's cursor stays on the same words", async ({ shot }) => {
      const patBox = boxOf(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(NOTE, { delay: 20 });
      const want = String(NOTE.length + start.indexOf(ANCHOR));
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-stays-on-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      if ((await recipeOf(sam.page, win)) !== start) throw new Error("Pat's unsaved note reached the board");
      return `Sam's line still sits before "${ANCHOR}" in Pat's unsaved copy (now letter ${want})`;
    });

    await check('walk', "Sam leaves the recipe; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await boxOf(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
