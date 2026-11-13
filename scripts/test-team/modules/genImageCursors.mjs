// Live cursors in the Image Generator's prompt for two people. Pat Example
// types a made-up prompt and Sam Example sees it. Sam puts the cursor after
// "a watercolor"; Pat must see a line with Sam's name at that spot, and when
// Pat types in front of it the line must move with Sam's words. When Sam
// clicks away, it leaves Pat's screen. Nothing is cooked, so no key is needed.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PROMPT = 'a watercolor of Pat Example Bakery at dawn';
const SPOT = 'a watercolor'.length;
const PAT_WORDS = 'soft ';
const P = 'Image prompt';

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: P });
const markOf = (page, id, name) => box(page, id).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);

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

// The prompt box shows while editing; a window that already has a prompt
// shows it on a button until "Edit prompt" is clicked.
async function openBox(page, id) {
  const edit = windowFrame(page, id).getByTitle('Edit prompt');
  // Wait for the window to show one or the other before choosing.
  await box(page, id).or(edit).first().waitFor({ timeout: 15_000 });
  if (!(await box(page, id).count())) await edit.click();
  await box(page, id).waitFor({ timeout: 15_000 });
}

export default {
  id: 'genImageCursors',
  label: "Image Generator: see a teammate's cursor in the prompt",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PROMPT, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up prompt, and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'genImage', {}, { x: 40, y: 40 }, { w: 560, h: 420 });
      await openBox(pat.page, win);
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(PROMPT, { delay: 8 });
      const ok = await waitFor(async () => ((await readWindow(sam.page, win)) ?? {}).prompt === PROMPT, 15_000, pat.page);
      await openBox(sam.page, win);
      await shot(sam.page, 'sam-sees-the-prompt');
      if (!ok) throw new Error("Sam's copy of the prompt does not match");
      return 'Sam has the same prompt';
    });

    await check('walk', "Sam puts the cursor after 'a watercolor'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win).press('End');
      await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"a watercolor\", and Sam sees Pat's";
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
      return `Sam's line still sits after "a watercolor" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
