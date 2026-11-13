// Live cursors in a Censai Vector text box for two people. Pat Example types
// the words of a made-up sign; Sam Example picks the same text box and puts
// the cursor after "Bake sale". Pat must see a line with Sam's name at that
// spot, and when Pat types in front of it the line must move with Sam's
// words. When Sam clicks away, it leaves Pat's screen. Nothing is written by
// the AI, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SID = 'crewS1';
const WORDS = 'Bake sale on Saturday';
const SPOT = 'Bake sale'.length;
const PAT_WORDS = 'Big ';

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Text', exact: true });
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const textOf = async (page, id) => String((await readWindow(page, id))?.[`vs.${SID}`]?.text ?? '');

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// Each person picks the text box in the shape list, which opens its words.
async function pick(page, id) {
  if (await box(page, id).count()) return;
  await windowFrame(page, id).getByRole('button', { name: /^Text:/ }).click({ timeout: 15_000 });
  await box(page, id).waitFor({ timeout: 10_000 });
}

const markAt = async (page, id, name) => {
  const m = markOf(box(page, id), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'vectorCursors',
  label: "Censai Vector: see a teammate's cursor in a text box",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up sign, and Sam picks the same text box', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'creativeVector', {
        title: 'Made-up sign',
        vectorDoc: { w: 1200, h: 800, bg: '#ffffff', order: [SID] },
        [`vs.${SID}`]: { type: 'text', x: 80, y: 160, fill: '#1f2937', stroke: 'none', sw: 0, opacity: 1, size: 72, weight: 700, text: '', at: 1 },
      }, { x: 40, y: 40 }, { w: 1000, h: 700 });
      await pick(pat.page, win);
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await pick(sam.page, win);
      await shot(sam.page, 'sam-sees-the-sign');
      if (!ok) throw new Error("Sam's copy of the sign does not match");
      return 'Sam has the same text box open';
    });

    await check('walk', "Sam puts the cursor after 'Bake sale'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win).press('End');
      await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(box(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Bake sale\", and Sam sees Pat's";
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
      return `Sam's line still sits after "Bake sale" (now letter ${want})`;
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
