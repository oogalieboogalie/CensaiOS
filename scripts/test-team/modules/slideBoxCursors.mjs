// Live cursors in a slide's text boxes for two people. Pat Example opens a
// made-up one-slide deck and Sam Example sees it. Sam double-clicks the body
// box and puts the cursor after "Fresh"; Pat, not typing, sees a name tag
// for Sam on that box only. Pat then double-clicks the same box and sees a
// line with Sam's name right at the letter, and when Pat types in front of
// it the line moves with Sam's words. When Sam clicks away, it leaves Pat's
// screen. Nothing is written by the AI, so no key is needed. All made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const TITLE = 'Made-up cover';
const BODY = 'Fresh bread every morning';
const SPOT = 'Fresh'.length;
const PAT_WORDS = 'New: ';
const block = (id, text, y) => ({ id, type: 'text', x: 6, y, w: 88, h: 16, text });
const DECK = {
  title: 'Made-up pitch',
  officeDeck: { order: ['s1'], theme: 'censai' },
  'os.s1': { layout: 'titleBody', blocks: [block('t1', TITLE, 7), block('b1', BODY, 40)], notes: '', at: 1 },
};

const boxes = (page, id) => windowFrame(page, id).locator('.hb-of-stage .hb-of-sblock[data-type="text"]');
const typing = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Slide text' });
const tagOn = (page, id, n, name) => boxes(page, id).nth(n).locator(`.hb-of-here-tag[data-teammate-caret="${name}"]`);
const lineIn = (page, id, name) => typing(page, id).locator('xpath=..').locator(`.hb-text-caret[data-teammate-caret="${name}"]`);
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
  id: 'slideBoxCursors',
  label: "Slides: see a teammate's cursor in a slide's text box",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS.replace(':', '').trim());
    let win;

    await check('walk', 'A made-up deck opens and both see its slide', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeSlides', DECK, { x: 40, y: 40 }, { w: 980, h: 640 });
      const ok = await waitFor(async () => (await boxes(sam.page, win).nth(1).textContent().catch(() => '')).includes(BODY), 15_000, sam.page);
      await shot(sam.page, 'sam-sees-the-slide');
      if (!ok) throw new Error('Sam does not see the slide body');
      return 'Both see the same slide';
    });

    await check('walk', "Sam types in the body box; Pat sees a name tag on that box only", async ({ shot }) => {
      await boxes(sam.page, win).nth(1).dblclick({ timeout: 10_000 });
      await typing(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await typing(sam.page, win).press('Shift');
      const ok = await waitFor(async () => (await tagOn(pat.page, win, 1, 'Sam Example').count()) > 0, 15_000, pat.page);
      await pat.page.waitForTimeout(400);
      await sideBySide(t, 'pat-sees-sams-tag-on-the-box', shot);
      if (!ok) throw new Error("Pat sees no name tag for Sam on the body box");
      if (await tagOn(pat.page, win, 0, 'Sam Example').count()) throw new Error("Sam's tag shows on the title box too");
      return "Pat sees Sam's name on the body box, not on the title";
    });

    await check('walk', "Pat opens the same box; Sam's cursor shows after 'Fresh'", async ({ shot }) => {
      await boxes(pat.page, win).nth(1).dblclick({ timeout: 10_000 });
      await typing(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await typing(pat.page, win).press('End');
      const ok = await waitFor(async () => ((await atOf(lineIn(pat.page, win, 'Sam Example'))) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(400);
      await sideBySide(t, 'pat-sees-sams-cursor-in-the-box', shot);
      if (!ok) throw new Error(`Pat sees Sam's cursor at ${(await atOf(lineIn(pat.page, win, 'Sam Example'))) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await waitFor(async () => (await lineIn(sam.page, win, 'Pat Example').count()) > 0, 10_000, sam.page))) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Fresh\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const box = typing(pat.page, win);
      await box.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await box.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await atOf(lineIn(pat.page, win, 'Sam Example'))) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(400);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await atOf(lineIn(pat.page, win, 'Sam Example'))}, not ${want}`);
      return `Sam's line still sits after "Fresh" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await typing(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await lineIn(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
