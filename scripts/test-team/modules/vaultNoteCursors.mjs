// Live cursors in a Vault note for two people. Pat Example makes a note and
// types made-up words; Sam Example opens the same note and sees them. Sam
// puts the cursor after "Sam Example"; Pat must see a line with Sam's name
// at that spot, and when Pat types in front of it the line must move with
// Sam's words. When Sam clicks away, it leaves Pat's screen. Nothing is sent
// to a model, so no key is needed.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Sam Example Bakery opening plan';
const SPOT = 'Sam Example'.length;
const PAT_WORDS = 'New: ';

const frame = (page, id) => windowFrame(page, id);
const box = (page, id) => frame(page, id).getByRole('textbox', { name: 'Note text' });
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

// The words of the board's one made note, as this person's browser sees them.
async function noteWords(page, id) {
  const win = (await readWindow(page, id)) ?? {};
  const note = Array.isArray(win.notes) ? win.notes[0] : null;
  return note ? win[`vt.${note.id}`] : undefined;
}

export default {
  id: 'vaultNoteCursors',
  label: "Vault notes: see a teammate's cursor in a note",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat makes a note and types made-up words, and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'vaultNotes', {}, { x: 40, y: 40 }, { w: 960, h: 620 });
      await frame(pat.page, win).getByRole('button', { name: 'New note' }).first().click({ timeout: 15_000 });
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await noteWords(sam.page, win)) === WORDS, 15_000, pat.page);
      await box(sam.page, win).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-note');
      if (!ok) throw new Error("Sam's copy of the note does not match");
      return 'Sam has the same note';
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
      if (!(await markOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Sam Example\", and Sam sees Pat's";
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
      const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
