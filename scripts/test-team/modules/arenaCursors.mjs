// Live cursors in the Model Arena for two people. Pat Example types a
// made-up request and Sam Example sees it. Sam puts the cursor after
// "Name three"; Pat must see a line with Sam's name at that spot, and when
// Pat types in front of it the line must move with Sam's words. Then Sam
// moves into the instructions box: Sam's line leaves the request and shows
// in the instructions. When Sam clicks away, it leaves Pat's screen. Nothing
// is raced, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const REQUEST = 'Name three made-up towns by the sea, one line each.';
const RULES = 'Keep it short.';
const SPOT = 'Name three'.length;
const PAT_WORDS = 'Please. ';
const REQ = 'Request to send to every model';
const SYS = 'Instructions for every model';

const box = (page, id, label) => windowFrame(page, id).getByRole('textbox', { name: label });
const markOf = (page, id, label, name) => box(page, id, label).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const promptOf = async (page, id) => (await readWindow(page, id))?.prompt ?? '';

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, label, name) => {
  const m = markOf(page, id, label, name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'arenaCursors',
  label: "Model Arena: see a teammate's cursor in the request and instructions",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(REQUEST, RULES, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up request and instructions, and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'modelArena', {}, { x: 40, y: 40 }, { w: 1100, h: 640 });
      await box(pat.page, win, REQ).click({ timeout: 15_000 });
      await box(pat.page, win, REQ).pressSequentially(REQUEST, { delay: 8 });
      await windowFrame(pat.page, win).getByRole('button', { name: 'Add instructions' }).click();
      await box(pat.page, win, SYS).click();
      await box(pat.page, win, SYS).pressSequentially(RULES, { delay: 8 });
      const ok = await waitFor(async () => (await promptOf(sam.page, win)) === REQUEST, 15_000, pat.page);
      await box(sam.page, win, SYS).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-request');
      if (!ok) throw new Error(`Sam's copy reads "${(await promptOf(sam.page, win)).slice(0, 60)}"`);
      return 'Sam has the same request and instructions';
    });

    await check('walk', "Sam puts the cursor after 'Name three'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win, REQ).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win, REQ).press('End');
      await box(sam.page, win, REQ).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win, REQ).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, REQ, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, REQ, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, REQ, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Name three\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win, REQ);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, REQ, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, REQ, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Name three" (now letter ${want})`;
    });

    await check('walk', "Sam moves to the instructions; Sam's line moves boxes on Pat's screen", async ({ shot }) => {
      await box(sam.page, win, SYS).evaluate((el) => { el.focus(); el.setSelectionRange(4, 4); });
      await box(sam.page, win, SYS).press('Shift');
      const ok = await waitFor(async () => ((await markAt(pat.page, win, SYS, 'Sam Example')) === '4'
        && !(await markOf(pat.page, win, REQ, 'Sam Example').count()) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'sams-cursor-in-the-instructions', shot);
      if (!ok) throw new Error("Sam's line did not move to the instructions on Pat's screen");
      return "Sam's line left the request and sits after \"Keep\" in the instructions";
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win, SYS).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, SYS, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
