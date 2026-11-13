// Censai Vector for two people. Pat Example makes a made-up sign with one text
// box and Sam Example sees it on the shared board. Then, at the same moment,
// Pat types at the start of the box's words while Sam types at the end: both
// people's words must be whole on both screens, and Pat's cursor must stay
// right after Pat's own words. Then Pat types while Sam picks a new text size:
// both changes stay. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SID = 'crewS1';
const shapeOf = async (page, id) => (await readWindow(page, id))?.[`vs.${SID}`] || {};

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => shapeOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

// Each person picks the text box in the shape list, which opens its settings.
async function pick(page, id) {
  await windowFrame(page, id).getByRole('button', { name: /^Text:/ }).click({ timeout: 15_000 });
}
const textBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Text', exact: true });

export default {
  id: 'vectorText',
  label: 'Censai Vector: two people type in one text box',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Bake sale ${run}`, pat: 'Big ', sam: ' at noon' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat makes a made-up sign and Sam sees its words', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'creativeVector', {
        title: 'Made-up sign',
        vectorDoc: { w: 1200, h: 800, bg: '#ffffff', order: [SID] },
        [`vs.${SID}`]: { type: 'text', x: 80, y: 160, fill: '#1f2937', stroke: 'none', sw: 0, opacity: 1, size: 72, weight: 700, text: '', at: 1 },
      }, { x: 40, y: 40 }, { w: 1000, h: 700 });
      await pick(pat.page, win);
      await textBox(pat.page, win).click({ timeout: 15_000 });
      await textBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, (s) => s.text === W.start);
      await pick(sam.page, win);
      await textBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-sign');
      if (samSaw.text !== W.start) throw new Error(`Sam's copy reads "${samSaw.text ?? ''}"`);
      return 'Sam has the same words, letter for letter';
    });

    await check('walk', 'Pat and Sam type in one text box at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [textBox(pat.page, win), textBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, (s) => s.text === want);
      await sideBySide(t, 'both-typed-in-one-box', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => s.text !== want);
      if (bad) throw new Error(`a screen's text box reads "${bad.text}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same words with Pat's and Sam's whole; Pat's cursor stayed after Pat's words";
    });

    await check('walk', 'Pat types while Sam changes the text size; both stay', async ({ shot }) => {
      const before = (await shapeOf(pat.page, win)).text;
      const patBox = textBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      const size = windowFrame(sam.page, win).getByRole('slider', { name: 'Text size', exact: true });
      await Promise.all([
        patBox.pressSequentially('!', { delay: 40 }),
        // The size slider saves when Sam lets go of it.
        size.fill('120').then(() => size.blur()),
      ]);
      const want = `${before}!`;
      const seen = await bothSee(t, win, (s) => s.text === want && s.size === 120);
      await sideBySide(t, 'words-and-size-at-once', shot);
      const bad = seen.find((s) => s.text !== want || s.size !== 120);
      if (bad) throw new Error(`a screen holds "${bad.text}" at size ${bad.size}`);
      return "both screens hold Pat's words and Sam's text size";
    });
  },
};
