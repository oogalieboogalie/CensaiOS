// Live cursors in a YorWare Layout text frame for two people. Pat Example
// types made-up words into a flyer's text frame; Sam Example opens the same
// frame and puts the cursor after "Bake sale". Pat must see a line with
// Sam's name at that spot in the Text panel, and when Pat types in front of
// it the line must move with Sam's words. On the page, the frame carries
// Sam's name tag; when Sam clicks away, it leaves Pat's screen. Nothing is
// written by the AI, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SID = 'crewS1';
const FID = 'crewF1';
const WORDS = 'Bake sale for Sam Example';
const SPOT = 'Bake sale'.length;
const PAT_WORDS = 'Big ';

const textBox = (page, id) => windowFrame(page, id).locator('textarea.hb-yl-story');
const panelTag = (page, id, name) => windowFrame(page, id).locator(`.hb-yl-story-box [data-teammate-caret="${name}"]`);
const pageTag = (page, id, name) => windowFrame(page, id).locator(`svg.hb-yl-page .hb-yl-here [data-teammate-caret="${name}"]`);
const textOf = async (page, id) => String((await readWindow(page, id))?.[`lst.${SID}`]?.text ?? '');

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function openFrame(page, id) {
  // The page strip draws small copies of each frame too; click the big page.
  await windowFrame(page, id).locator(`svg.hb-yl-page [data-frame="${FID}"]`).first().click({ force: true });
  await textBox(page, id).waitFor({ timeout: 10_000 });
}

const tagAt = async (loc) => ((await loc.count()) ? loc.first().getAttribute('data-at') : null);

export default {
  id: 'layoutCursors',
  label: "YorWare Layout: see a teammate's cursor in a text frame",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types words on a made-up flyer, and Sam opens the same frame', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'yorLayout', {
        title: 'Made-up flyer',
        layDoc: { size: 'letter', w: 612, h: 792, margin: 36, order: ['crewP1'] },
        'lpg.crewP1': { at: 1 },
        [`lfr.${FID}`]: { page: 'crewP1', type: 'text', x: 72, y: 96, w: 468, h: 200, z: 1, story: SID },
        [`lst.${SID}`]: { text: '', font: 'sans', size: 24, frames: [FID] },
      }, { x: 40, y: 40 }, { w: 1100, h: 760 });
      await openFrame(pat.page, win);
      await textBox(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await openFrame(sam.page, win);
      await shot(sam.page, 'sam-sees-the-words');
      if (!ok) throw new Error("Sam's copy of the words does not match");
      return 'Sam has the same text frame open';
    });

    await check('walk', "Sam puts the cursor after 'Bake sale'; Pat sees Sam's name there", async ({ shot }) => {
      await textBox(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await textBox(pat.page, win).press('End');
      await textBox(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await textBox(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await tagAt(panelTag(pat.page, win, 'Sam Example'))) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await tagAt(panelTag(pat.page, win, 'Sam Example'))) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await panelTag(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      if (!(await pageTag(pat.page, win, 'Sam Example').count())) throw new Error("Pat's page shows no name tag for Sam on the frame");
      return "Pat sees a line with Sam's name right after \"Bake sale\" and a name tag on the frame; Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = textBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await tagAt(panelTag(pat.page, win, 'Sam Example'))) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await tagAt(panelTag(pat.page, win, 'Sam Example'))}, not ${want}`);
      return `Sam's line still sits after "Bake sale" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor and name tag leave Pat's screen", async ({ shot }) => {
      await textBox(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await panelTag(pat.page, win, 'Sam Example').count()) === 0
        && (await pageTag(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line and name tag go when Sam clicks away";
    });
  },
};
