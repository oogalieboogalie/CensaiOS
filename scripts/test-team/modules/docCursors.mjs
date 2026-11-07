// Live cursors in a Document for two people. Pat Example writes made-up
// words and Sam Example sees them. Both open the editor; Sam puts the cursor
// after "Order rye". Pat must see a line with Sam's name at that spot, and
// when Pat types in front of it the line must move along with Sam's words
// (it sits after "Order rye" still). Sam sees Pat's cursor too. When Sam
// clicks away, Sam's line leaves Pat's screen. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Order rye flour and two bags of salt.';
const PAT_WORDS = 'Today: ';

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Document text' });
const markOf = (page, id, name) => windowFrame(page, id).locator(`[data-teammate-caret="${name}"]`);
const textOf = (page, id) => page.evaluate((wid) => String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? ''), id);

async function openEditor(page, id) {
  const frame = windowFrame(page, id);
  if (!(await box(page, id).count())) await frame.locator('[data-doc-body]').click();
  await box(page, id).waitFor({ timeout: 10_000 });
  return box(page, id);
}

async function waitFor(fn, ms = 15_000, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

export default {
  id: 'docCursors',
  label: "Document: see a teammate's cursor as they type",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat writes made-up words and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'doc', { text: '' }, { x: 60, y: 60 }, { w: 640, h: 380 });
      const patBox = await openEditor(pat.page, win);
      await patBox.click();
      await patBox.pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await shot(sam.page, 'sam-sees-the-words');
      if (!ok) throw new Error(`Sam's copy reads "${(await textOf(sam.page, win)).slice(0, 60)}"`);
      return 'Sam has the same words';
    });

    await check('walk', "Sam puts the cursor after 'Order rye'; Pat sees Sam's name there", async ({ shot }) => {
      const samBox = await openEditor(sam.page, win);
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(9, 9); });
      await samBox.press('Shift');
      const at = await waitFor(async () => {
        const m = markOf(pat.page, win, 'Sam Example');
        const v = (await m.count()) ? await m.getAttribute('data-at') : null;
        return v === '9' ? v : null;
      }, 15_000, pat.page) ?? await markOf(pat.page, win, 'Sam Example').getAttribute('data-at').catch(() => null);
      await pat.page.waitForTimeout(500); // the line glides to its spot
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      const settled = await markOf(pat.page, win, 'Sam Example').getAttribute('data-at');
      if (settled !== '9') throw new Error(`Sam's cursor moved on to ${settled} by itself`);
      if (at !== '9') throw new Error(`Pat sees Sam's cursor at ${at ?? 'nowhere'}, not after "Order rye" (9)`);
      const patSeen = await markOf(sam.page, win, 'Pat Example').count();
      if (!patSeen) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Order rye\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(9 + PAT_WORDS.length);
      const at = await waitFor(async () => {
        const v = await markOf(pat.page, win, 'Sam Example').getAttribute('data-at').catch(() => null);
        return v === want ? v : null;
      }, 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (at !== want) throw new Error(`Sam's cursor sits at ${await markOf(pat.page, win, 'Sam Example').getAttribute('data-at')}, not ${want}`);
      return `Sam's line still sits after "Order rye" (now letter ${want})`;
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
