// Live cursors in Image Studio for two people. Pat Example types a made-up
// prompt and instructions, and Sam Example sees them. Sam puts the cursor
// after "a poster"; Pat must see a line with Sam's name at that spot, and
// when Pat types in front of it the line must move with Sam's words. Then
// Sam moves into the additional instructions: Sam's line leaves the prompt
// and shows there. When Sam clicks away, it leaves Pat's screen. Nothing is
// generated, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PROMPT = 'a poster for Pat Example Bakery by the sea';
const NOTES = 'warm colours, no text';
const SPOT = 'a poster'.length;
const PAT_WORDS = 'bold ';
const P = 'Image prompt';
const N = 'Additional instructions';

const box = (page, id, label) => windowFrame(page, id).getByRole('textbox', { name: label });
const markOf = (page, id, label, name) => box(page, id, label).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const wordsOf = async (page, id) => (await readWindow(page, id)) ?? {};

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
  id: 'studioCursors',
  label: "Image Studio: see a teammate's cursor in the prompt and instructions",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PROMPT, NOTES, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up prompt and instructions, and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'imageStudio', {}, { x: 40, y: 40 }, { w: 900, h: 560 });
      await box(pat.page, win, P).click({ timeout: 15_000 });
      await box(pat.page, win, P).pressSequentially(PROMPT, { delay: 8 });
      await windowFrame(pat.page, win).getByRole('button', { name: 'Additional Instructions' }).click();
      await box(pat.page, win, N).click();
      await box(pat.page, win, N).pressSequentially(NOTES, { delay: 8 });
      const ok = await waitFor(async () => {
        const w = await wordsOf(sam.page, win);
        return w.prompt === PROMPT && w.imageNotes === NOTES;
      }, 15_000, pat.page);
      const more = windowFrame(sam.page, win).getByRole('button', { name: 'Additional Instructions' });
      if (!(await box(sam.page, win, N).count())) await more.click();
      await box(sam.page, win, N).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-prompt');
      if (!ok) throw new Error(`Sam's copy reads "${String((await wordsOf(sam.page, win)).prompt ?? '').slice(0, 60)}"`);
      return 'Sam has the same prompt and instructions';
    });

    await check('walk', "Sam puts the cursor after 'a poster'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win, P).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win, P).press('End');
      await box(sam.page, win, P).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win, P).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, P, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, P, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, P, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"a poster\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win, P);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, P, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, P, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "a poster" (now letter ${want})`;
    });

    await check('walk', "Sam moves to the instructions; Sam's line moves boxes on Pat's screen", async ({ shot }) => {
      await box(sam.page, win, N).evaluate((el) => { el.focus(); el.setSelectionRange(4, 4); });
      await box(sam.page, win, N).press('Shift');
      const ok = await waitFor(async () => ((await markAt(pat.page, win, N, 'Sam Example')) === '4'
        && !(await markOf(pat.page, win, P, 'Sam Example').count()) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'sams-cursor-in-the-instructions', shot);
      if (!ok) throw new Error("Sam's line did not move to the instructions on Pat's screen");
      return "Sam's line left the prompt and sits after \"warm\" in the instructions";
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win, N).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, N, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
