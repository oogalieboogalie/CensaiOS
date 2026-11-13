// Live cursors in Idea Pad bullets for two people. Pat Example spawns an
// Idea Pad with two made-up bullets and Sam Example sees them. Sam puts the
// cursor after "Fresh" in the first bullet; Pat must see a line with Sam's
// name at that spot (and none in the second bullet), and when Pat types in
// front of it the line must move with Sam's words. When Sam clicks away, it
// leaves Pat's screen. Nothing is saved to a project, so no key is needed.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const FIRST = 'Fresh bread page';
const SECOND = 'Opening hours';
const SPOT = 'Fresh'.length;
const PAT_WORDS = 'New: ';

const bullet = (page, id, n) => windowFrame(page, id).getByRole('textbox', { name: `Idea bullet ${n}` });
const markOf = (page, id, n, name) => bullet(page, id, n).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, name) => {
  const m = markOf(page, id, 1, name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'ideaBulletCursors',
  label: "Idea Pad: see a teammate's cursor in a bullet",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS.replace(':', '').trim());
    let win;

    await check('walk', 'A made-up Idea Pad opens and both see its bullets', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'idea', { ideas: [FIRST, SECOND], workItem: 'Sam Example Bakery' }, { x: 40, y: 40 }, { w: 960, h: 620 });
      const ok = await waitFor(async () => (await bullet(sam.page, win, 1).inputValue().catch(() => '')) === FIRST, 15_000, sam.page);
      await shot(sam.page, 'sam-sees-the-bullets');
      if (!ok) throw new Error('Sam does not see the first bullet');
      return 'Both see the same two bullets';
    });

    await check('walk', "Sam puts the cursor after 'Fresh'; Pat sees Sam's name there", async ({ shot }) => {
      await bullet(pat.page, win, 1).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await bullet(pat.page, win, 1).press('End');
      await bullet(sam.page, win, 1).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await bullet(sam.page, win, 1).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (await markOf(pat.page, win, 2, 'Sam Example').count()) throw new Error("Sam's cursor shows in the second bullet too");
      if (!(await markOf(sam.page, win, 1, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Fresh\" in the first bullet only, and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = bullet(pat.page, win, 1);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Fresh" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await bullet(sam.page, win, 1).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, 1, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
