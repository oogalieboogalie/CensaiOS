// Live cursors in the LeadHound brief for two people. Pat Example types a
// made-up business; Sam Example sees it and puts the cursor after "Sam
// Example". Pat must see a line with Sam's name at that spot, only in the
// business box, and when Pat types in front of it the line must move with
// Sam's words. When Sam clicks away, it leaves Pat's screen. No hunt runs,
// so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Sam Example Bakery bakes bread for cafes';
const SPOT = 'Sam Example'.length;
const PAT_WORDS = 'New: ';

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Your service or business' });
const market = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Target market' });
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, name) => {
  const m = markOf(box(page, id), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

const businessOf = async (page, id) => (await readWindow(page, id))?.leadBrief?.business;

export default {
  id: 'leadBriefCursors',
  label: "LeadHound: see a teammate's cursor in the brief",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up business, and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'leadHound', {}, { x: 40, y: 40 }, { w: 1000, h: 720 });
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await businessOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await box(sam.page, win).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-brief');
      if (!ok) throw new Error("Sam's copy of the brief does not match");
      return 'Sam has the same business in the brief';
    });

    await check('walk', "Sam puts the cursor after 'Sam Example'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win).press('End');
      await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(box(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      if (await markOf(market(pat.page, win), 'Sam Example').count()) throw new Error("Sam's cursor shows in the market box too");
      return "Pat sees a line with Sam's name right after \"Sam Example\", only in that box, and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Sam Example" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(box(pat.page, win), 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
