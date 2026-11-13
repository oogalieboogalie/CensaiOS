// Live cursors in Slides speaker notes for two people. Pat Example makes a
// made-up slide and types its speaker notes; Sam Example sees them and puts
// the cursor after "Open with". Pat must see a line with Sam's name at that
// spot, and when Pat types in front of it the line must move with Sam's
// words. When Sam clicks away, it leaves Pat's screen. Nothing is written by
// the AI, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Open with the made-up demo, then thank the team';
const SPOT = 'Open with'.length;
const PAT_WORDS = 'Smile. ';

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Speaker notes', exact: true });
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

async function notesOf(page, id) {
  const win = (await readWindow(page, id)) || {};
  const key = Object.keys(win).find((k) => k.startsWith('os.') && win[k]);
  return key ? String(win[key].notes ?? '') : '';
}

export default {
  id: 'notesCursors',
  label: "Slides: see a teammate's cursor in the speaker notes",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types made-up speaker notes, and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeSlides', { title: 'Made-up pitch' }, { x: 40, y: 40 }, { w: 960, h: 600 });
      await windowFrame(pat.page, win).getByRole('button', { name: 'Add your first slide' }).click({ timeout: 15_000 });
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await notesOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await box(sam.page, win).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-notes');
      if (!ok) throw new Error("Sam's copy of the notes does not match");
      return 'Sam has the same speaker notes';
    });

    await check('walk', "Sam puts the cursor after 'Open with'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win).press('End');
      await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(box(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Open with\", and Sam sees Pat's";
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
      return `Sam's line still sits after "Open with" (now letter ${want})`;
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
