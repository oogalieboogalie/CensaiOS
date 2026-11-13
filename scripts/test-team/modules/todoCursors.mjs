// Live cursors in a To-do list for two people. Pat Example spawns a list
// with two made-up to-dos. Sam Example opens the first to-do and puts the
// cursor after "Order"; Pat, only looking, must see a name tag for Sam on that
// row (and not on the other). Then Pat opens the same to-do and must see a
// line with Sam's name right after "Order", and when Pat types in front of
// it the line must move with Sam's words. When Sam clicks away, it leaves
// Pat's screen. Nothing is handed off, so no key is needed. All made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const FIRST = 'Order rye flour';
const SECOND = 'Book the oven repair';
const SPOT = 'Order'.length;
const PAT_WORDS = 'Now: ';
const ITEMS = [
  { id: 'tc1', text: FIRST, done: false, assignee: null },
  { id: 'tc2', text: SECOND, done: false, assignee: null },
];

const wordsBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'To-do words' });
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const tagOn = (page, id, words, name) => windowFrame(page, id).getByText(words, { exact: true })
  .locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, name) => {
  const m = markOf(wordsBox(page, id), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'todoCursors',
  label: "To-do list: see a teammate's cursor in a to-do",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS.replace(':', '').trim());
    let win;

    await check('walk', 'A made-up list opens and both see its to-dos', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'todos', { items: ITEMS }, { x: 40, y: 40 }, { w: 520, h: 420 });
      for (const p of [pat, sam]) await windowFrame(p.page, win).getByText(FIRST).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-list');
      return 'Both see the same two to-dos';
    });

    await check('walk', "Sam edits the first to-do; Pat, only looking, sees Sam's name tag on it", async ({ shot }) => {
      await windowFrame(sam.page, win).getByText(FIRST).dblclick();
      await wordsBox(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await wordsBox(sam.page, win).press('Shift');
      const ok = await waitFor(async () => (await tagOn(pat.page, win, FIRST, 'Sam Example').count()) > 0, 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-tag', shot);
      if (!ok) throw new Error("Pat sees no name tag for Sam on the first to-do");
      if (await tagOn(pat.page, win, SECOND, 'Sam Example').count()) throw new Error("Sam's tag shows on the other to-do too");
      return "Pat sees a tag with Sam's name on the first to-do only";
    });

    await check('walk', "Pat opens the same to-do; Sam's cursor shows after 'Order'", async ({ shot }) => {
      await windowFrame(pat.page, win).getByText(FIRST).dblclick();
      await wordsBox(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await wordsBox(pat.page, win).press('End');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(wordsBox(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Order\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = wordsBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Order" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await wordsBox(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(wordsBox(pat.page, win), 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
