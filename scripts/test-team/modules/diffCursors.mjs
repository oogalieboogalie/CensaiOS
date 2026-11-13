// Live cursors in the Git Diff Viewer for two people. Pat Example types a
// made-up old and new version and Sam Example sees them. Sam puts the cursor
// after "flour 2" in Before; Pat must see a line with Sam's name at that
// spot, and when Pat types in front of it the line must move with Sam's
// words. Then Sam moves into After: Sam's line leaves Before and shows in
// After. When Sam clicks away, it leaves Pat's screen. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const BEFORE = 'flour 2 cups for Pat Example Bakery';
const AFTER = 'flour 3 cups';
const SPOT = 'flour 2'.length;
const PAT_WORDS = 'Made-up: ';
const B = 'gdv-before';
const A = 'gdv-after';

const box = (page, id, testId) => windowFrame(page, id).getByTestId(testId);
const markOf = (page, id, testId, name) => box(page, id, testId).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const fieldOf = async (page, id, key) => (await readWindow(page, id))?.[key] ?? '';

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, testId, name) => {
  const m = markOf(page, id, testId, name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'diffCursors',
  label: "Git Diff Viewer: see a teammate's cursor in Before and After",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(BEFORE, AFTER, PAT_WORDS.replace(/[: ]+$/, ''));
    let win;

    await check('walk', 'Pat types a made-up old and new version, and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'gitDiff', {}, { x: 40, y: 40 }, { w: 1100, h: 600 });
      await box(pat.page, win, B).click({ timeout: 15_000 });
      await box(pat.page, win, B).pressSequentially(BEFORE, { delay: 8 });
      await box(pat.page, win, A).click();
      await box(pat.page, win, A).pressSequentially(AFTER, { delay: 8 });
      const ok = await waitFor(async () => (await fieldOf(sam.page, win, 'diffBefore')) === BEFORE
        && (await fieldOf(sam.page, win, 'diffAfter')) === AFTER, 15_000, pat.page);
      await box(sam.page, win, A).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-both-versions');
      if (!ok) throw new Error(`Sam's Before reads "${(await fieldOf(sam.page, win, 'diffBefore')).slice(0, 60)}"`);
      return 'Sam has the same Before and After';
    });

    await check('walk', "Sam puts the cursor after 'flour 2'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win, B).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win, B).press('End');
      await box(sam.page, win, B).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win, B).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, B, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, B, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, B, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"flour 2\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win, B);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, B, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, B, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "flour 2" (now letter ${want})`;
    });

    await check('walk', "Sam moves to After; Sam's line moves boxes on Pat's screen", async ({ shot }) => {
      await box(sam.page, win, A).evaluate((el) => { el.focus(); el.setSelectionRange(5, 5); });
      await box(sam.page, win, A).press('Shift');
      const ok = await waitFor(async () => ((await markAt(pat.page, win, A, 'Sam Example')) === '5'
        && !(await markOf(pat.page, win, B, 'Sam Example').count()) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'sams-cursor-in-after', shot);
      if (!ok) throw new Error("Sam's line did not move to After on Pat's screen");
      return "Sam's line left Before and sits after \"flour\" in After";
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win, A).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, A, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
