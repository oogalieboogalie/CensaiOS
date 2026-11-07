// Step cards answer typing for two people. Pat Example opens a made-up .todo
// card and types what the helper said on its open step, and Sam Example sees
// it while Pat types (before, it was saved only when Pat clicked away, and the
// last one to change the card won). Then, at the same moment, Pat types at
// the start of the answer while Sam types at the end of it: both people's
// words must be whole on both screens, and Pat's cursor must stay right after
// Pat's own words. Nothing is checked, so no model is asked. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const todoFile = (run) => [
  'censaiOS to-do file', `Title: Made-up shelf ${run}`, '',
  `== Card 1: Made-up fix the shelf ${run}`, 'Goal: Made-up goal for a made-up shop.', '',
  '-- Step 1: Sand the shelf', 'Made-up words for sanding.', '[ ] ask The shelf is smooth', '',
  '-- Step 2: Oil the shelf', 'Made-up words for oiling.', '[ ] ask The shelf is oiled', '',
].join('\n');

const answerOf = async (page, id) => (await readWindow(page, id))?.cards?.[0]?.steps?.[0]?.report ?? '';

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => answerOf(p.page, id)));
    if (seen.every((s) => s === want) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const answerBox = (page, id) => windowFrame(page, id).locator('.hb-sc-report textarea');

export default {
  id: 'stepReportTyping',
  label: 'Step cards: two people type one step\'s answer at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Sam Example sanded the shelf ${run}`, pat: 'Done: ', sam: ', twice over' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat types what the helper said and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'stepCards', {}, { x: 40, y: 40 }, { w: 960, h: 620 });
      const frame = windowFrame(pat.page, win);
      await frame.locator('input[type="file"]').setInputFiles({ name: 'made-up-shelf.todo', mimeType: 'text/plain', buffer: Buffer.from(todoFile(run)) });
      await answerBox(pat.page, win).click({ timeout: 15_000 });
      await answerBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, W.start);
      await answerBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-answer');
      if (samSaw !== W.start) throw new Error(`Sam's copy reads "${samSaw}"`);
      const onScreen = await answerBox(sam.page, win).inputValue();
      if (onScreen !== W.start) throw new Error(`Sam's answer box shows "${onScreen}"`);
      return 'Sam has the same answer, letter for letter, in the box';
    });

    await check('walk', 'Pat and Sam type in the answer at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [answerBox(pat.page, win), answerBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => s !== want);
      if (bad !== undefined) throw new Error(`a screen's answer reads "${bad}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one answer with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
