// YorWare Layout for two people. Pat Example makes a made-up flyer with one
// text frame and Sam Example sees it on the shared board. Then, at the same
// moment, Pat types at the start of the frame's words while Sam types at the
// end: both people's words must be whole on both screens, and Pat's cursor
// must stay right after Pat's own words. Then Pat types while Sam picks a new
// font: both changes stay. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SID = 'crewS1';
const FID = 'crewF1';
const storyOf = async (page, id) => (await readWindow(page, id))?.[`lst.${SID}`] || {};

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => storyOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const textBox = (page, id) => windowFrame(page, id).locator('textarea.hb-yl-story');

async function openFrame(page, id) {
  // The page strip draws small copies of each frame too; click the big page.
  await windowFrame(page, id).locator(`svg.hb-yl-page [data-frame="${FID}"]`).first().click({ force: true });
  await textBox(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'layoutStory',
  label: 'YorWare Layout: two people type in one text frame',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Bake sale ${run}`, pat: 'Big ', sam: ' at noon' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat makes a made-up flyer and Sam sees its words', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'yorLayout', {
        title: 'Made-up flyer',
        layDoc: { size: 'letter', w: 612, h: 792, margin: 36, order: ['crewP1'] },
        'lpg.crewP1': { at: 1 },
        [`lfr.${FID}`]: { page: 'crewP1', type: 'text', x: 72, y: 72, w: 468, h: 200, z: 1, story: SID },
        [`lst.${SID}`]: { text: '', font: 'sans', size: 24, frames: [FID] },
      }, { x: 40, y: 40 }, { w: 1000, h: 700 });
      await openFrame(pat.page, win);
      await textBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, (s) => s.text === W.start);
      await openFrame(sam.page, win);
      await shot(sam.page, 'sam-sees-the-flyer');
      if (samSaw.text !== W.start) throw new Error(`Sam's copy reads "${samSaw.text ?? ''}"`);
      return 'Sam has the same words, letter for letter';
    });

    await check('walk', 'Pat and Sam type in one frame at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [textBox(pat.page, win), textBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, (s) => s.text === want);
      await sideBySide(t, 'both-typed-in-one-frame', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => s.text !== want);
      if (bad) throw new Error(`a screen's frame reads "${bad.text}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same words with Pat's and Sam's whole; Pat's cursor stayed after Pat's words";
    });

    await check('walk', 'Pat types while Sam picks a new font; both stay', async ({ shot }) => {
      const before = (await storyOf(pat.page, win)).text;
      const patBox = textBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially('!', { delay: 40 }),
        windowFrame(sam.page, win).getByLabel('Font', { exact: true }).selectOption('serif'),
      ]);
      const want = `${before}!`;
      const seen = await bothSee(t, win, (s) => s.text === want && s.font === 'serif');
      await sideBySide(t, 'words-and-font-at-once', shot);
      const bad = seen.find((s) => s.text !== want || s.font !== 'serif');
      if (bad) throw new Error(`a screen holds "${bad.text}" in font "${bad.font}"`);
      return "both screens hold Pat's words and Sam's font";
    });
  },
};
