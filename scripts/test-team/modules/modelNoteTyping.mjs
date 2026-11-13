// YorWare 3D Viewer for two people. Pat Example opens a note pinned on a
// made-up model and types in it; Sam Example sees the words on the shared
// board as they are typed, not only when Pat leaves the box. Then, at the
// same moment, Pat types at the start of the note while Sam types at the end:
// both people's words must be whole on both screens, and Pat's cursor must
// stay right after Pat's own words. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const NID = 'crewN1';
const noteOf = async (page, id) => (await readWindow(page, id))?.[`m3n.${NID}`] || {};

// A made-up wedge: one triangle, as a plain-text 3D printing file.
const STL = Buffer.from([
  'solid wedge',
  'facet normal 0 0 1', 'outer loop', 'vertex 0 0 0', 'vertex 20 0 0', 'vertex 0 20 0', 'endloop', 'endfacet',
  'endsolid wedge',
].join('\n')).toString('base64');

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => noteOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const noteBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Note text' });
async function open(page, id) {
  if (await noteBox(page, id).count()) return;
  await windowFrame(page, id).locator('.hb-y3d-note .hb-cr-layer-name').first().click({ timeout: 15_000 });
  await noteBox(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'modelNoteTyping',
  label: '3D Viewer: two people type in one note pinned on a model',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Sam Example ${run}`, pat: 'Check: ', sam: ', hole too small' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat types in a note and Sam sees the words while Pat is still typing', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'yor3d', {
        title: 'Made-up wedge',
        m3Scene: { order: ['crewK1'] },
        'm3.crewK1': { name: 'Made-up wedge', format: 'stl', main: 'wedge.stl', files: { 'wedge.stl': STL }, bytes: STL.length, at: 1 },
        [`m3n.${NID}`]: { model: 'crewK1', p: [5, 5, 0], text: '', by: 'Pat Example', at: 2 },
      }, { x: 40, y: 40 }, { w: 1100, h: 720 });
      await open(pat.page, win);
      await noteBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      // Pat's box is still open and focused: nothing was saved by leaving it.
      const [, samSaw] = await bothSee(t, win, (n) => n.text === W.start);
      await open(sam.page, win);
      await shot(sam.page, 'sam-sees-the-words');
      if (samSaw.text !== W.start) throw new Error(`Sam's copy reads "${samSaw.text ?? ''}"`);
      return 'Sam has the same words, letter for letter, while Pat is still in the box';
    });

    await check('walk', 'Pat and Sam type in one note at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [noteBox(pat.page, win), noteBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, (n) => n.text === want);
      await sideBySide(t, 'both-typed-in-one-note', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((n) => n.text !== want);
      if (bad) throw new Error(`a screen's note reads "${bad.text}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same words with Pat's and Sam's whole; Pat's cursor stayed after Pat's words";
    });
  },
};
