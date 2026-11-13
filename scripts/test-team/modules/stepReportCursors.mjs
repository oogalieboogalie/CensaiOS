// Live cursors in a Step cards answer box for two people. Pat Example opens a
// made-up .todo card and types what the helper said on its open step, and
// Sam Example sees it. Sam puts the cursor after "Sam" in the answer; Pat
// must see a line with Sam's name at that spot, and when Pat types in front
// of it the line must move with Sam's words. When Sam clicks away, it leaves
// Pat's screen. Nothing is checked, so no model is asked. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const todoFile = (run) => [
  'censaiOS to-do file', `Title: Made-up shelf ${run}`, '',
  `== Card 1: Made-up fix the shelf ${run}`, 'Goal: Made-up goal for a made-up shop.', '',
  '-- Step 1: Sand the shelf', 'Made-up words for sanding.', '[ ] ask The shelf is smooth', '',
  '-- Step 2: Oil the shelf', 'Made-up words for oiling.', '[ ] ask The shelf is oiled', '',
].join('\n');

const ANSWER = 'Sam Example sanded the shelf';
const SPOT = 'Sam'.length;
const PAT_WORDS = 'Done: ';

const answerBox = (page, id) => windowFrame(page, id).locator('.hb-sc-report textarea');
const markOf = (page, id, name) => windowFrame(page, id).locator(`.hb-sc-report-box [data-teammate-caret="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, name) => {
  const m = markOf(page, id, name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'stepReportCursors',
  label: "Step cards: see a teammate's cursor in a step's answer",
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    t.typed.push(ANSWER, PAT_WORDS.replace(':', '').trim());
    let win;

    await check('walk', 'A made-up card opens and both see its answer', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'stepCards', {}, { x: 40, y: 40 }, { w: 960, h: 620 });
      const frame = windowFrame(pat.page, win);
      await frame.locator('input[type="file"]').setInputFiles({ name: 'made-up-shelf.todo', mimeType: 'text/plain', buffer: Buffer.from(todoFile(run)) });
      await answerBox(pat.page, win).click({ timeout: 15_000 });
      await answerBox(pat.page, win).pressSequentially(ANSWER, { delay: 10 });
      const ok = await waitFor(async () => (await answerBox(sam.page, win).inputValue().catch(() => '')) === ANSWER, 15_000, sam.page);
      await shot(sam.page, 'sam-sees-the-answer');
      if (!ok) throw new Error('Sam does not see the answer');
      return 'Both see the same answer';
    });

    await check('walk', "Sam puts the cursor after 'Sam'; Pat sees Sam's name there", async ({ shot }) => {
      await answerBox(pat.page, win).press('End');
      await answerBox(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await answerBox(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Sam\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = answerBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Sam" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await answerBox(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
