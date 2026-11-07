// Live cursors in a Teleprompter script for two people. Pat Example writes a
// made-up script and Sam Example sees it. Both open the script for editing;
// Sam puts the cursor after "Welcome to the". Pat must see a line with Sam's
// name at that spot, and when Pat types in front of it the line must move
// along with Sam's words. Sam sees Pat's cursor too. When Sam goes back to
// reading, Sam's line leaves Pat's screen. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SCRIPT = 'Welcome to the made-up bakery tour. Mind the flour on the floor.';
const SPOT = 'Welcome to the'.length;
const PAT_WORDS = 'Hello all. ';

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Script' });
const markOf = (page, id, name) => windowFrame(page, id).locator(`[data-teammate-caret="${name}"]`);
const textOf = (page, id) => page.evaluate((wid) => String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? ''), id);

async function openScript(page, id) {
  if (!(await box(page, id).count())) await windowFrame(page, id).getByRole('button', { name: 'Edit script', exact: true }).click();
  await box(page, id).waitFor({ timeout: 10_000 });
  return box(page, id);
}

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
  id: 'prompterCursors',
  label: "Teleprompter: see a teammate's cursor in the script",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(SCRIPT, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat writes a made-up script and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'teleprompter', { text: '' }, { x: 60, y: 60 }, { w: 640, h: 420 });
      const patBox = await openScript(pat.page, win);
      await patBox.click();
      await patBox.pressSequentially(SCRIPT, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(sam.page, win)) === SCRIPT, 15_000, pat.page);
      await shot(sam.page, 'sam-sees-the-script');
      if (!ok) throw new Error(`Sam's copy reads "${(await textOf(sam.page, win)).slice(0, 60)}"`);
      return 'Sam has the same script';
    });

    await check('walk', "Sam puts the cursor after 'Welcome to the'; Pat sees Sam's name there", async ({ shot }) => {
      const samBox = await openScript(sam.page, win);
      await samBox.evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await samBox.press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500); // the line glides to its spot
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Welcome to the\", and Sam sees Pat's";
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
      return `Sam's line still sits after "Welcome to the" (now letter ${want})`;
    });

    await check('walk', "Sam goes back to reading; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await windowFrame(sam.page, win).getByRole('button', { name: 'Read it' }).click();
      const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
