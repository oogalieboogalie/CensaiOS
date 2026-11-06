// Censai Photo for two people. Pat Example makes a made-up poster with one
// text layer and Sam Example sees it on the shared board. Then, at the same
// moment, Pat types at the start of the layer's words while Sam types at the
// end: both people's words must be whole on both screens, and Pat's cursor
// must stay right after Pat's own words. Then Pat types while Sam picks a new
// blend: both changes stay. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const LID = 'crewL1';
const layerOf = async (page, id) => (await readWindow(page, id))?.[`pl.${LID}`] || {};

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => layerOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

// The only layer is the top one, so its settings are open without a click.
const textBox = (page, id) => windowFrame(page, id).getByLabel('Text', { exact: true });

export default {
  id: 'photoText',
  label: 'Censai Photo: two people type in one text layer',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Bake sale ${run}`, pat: 'Big ', sam: ' at noon' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat makes a made-up poster and Sam sees its words', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'creativePhoto', {
        title: 'Made-up poster',
        photoDoc: { w: 1200, h: 800, order: [LID] },
        [`pl.${LID}`]: { kind: 'text', name: 'Headline', x: 80, y: 120, visible: true, opacity: 1, blend: 'source-over', adj: {}, text: '', size: 96, weight: 700, at: 1 },
      }, { x: 40, y: 40 }, { w: 1000, h: 700 });
      await textBox(pat.page, win).click({ timeout: 15_000 });
      await textBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, (l) => l.text === W.start);
      await textBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-poster');
      if (samSaw.text !== W.start) throw new Error(`Sam's copy reads "${samSaw.text ?? ''}"`);
      return 'Sam has the same words, letter for letter';
    });

    await check('walk', 'Pat and Sam type in one layer at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [textBox(pat.page, win), textBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, (l) => l.text === want);
      await sideBySide(t, 'both-typed-in-one-layer', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((l) => l.text !== want);
      if (bad) throw new Error(`a screen's layer reads "${bad.text}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same words with Pat's and Sam's whole; Pat's cursor stayed after Pat's words";
    });

    await check('walk', 'Pat types while Sam picks a new blend; both stay', async ({ shot }) => {
      const before = (await layerOf(pat.page, win)).text;
      const patBox = textBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially('!', { delay: 40 }),
        windowFrame(sam.page, win).getByLabel('Blend mode', { exact: true }).selectOption('multiply'),
      ]);
      const want = `${before}!`;
      const seen = await bothSee(t, win, (l) => l.text === want && l.blend === 'multiply');
      await sideBySide(t, 'words-and-blend-at-once', shot);
      const bad = seen.find((l) => l.text !== want || l.blend !== 'multiply');
      if (bad) throw new Error(`a screen holds "${bad.text}" with blend "${bad.blend}"`);
      return "both screens hold Pat's words and Sam's blend";
    });
  },
};
