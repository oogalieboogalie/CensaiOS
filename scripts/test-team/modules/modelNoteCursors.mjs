// Live cursors in a 3D Viewer note for two people. Pat Example opens a note
// pinned on a made-up model and types in it; Sam Example opens the same note
// and puts the cursor after "Hole looks". Pat must see a line with Sam's name
// at that spot, and when Pat types in front of it the line must move with
// Sam's words. When Sam clicks away, it leaves Pat's screen. Nothing is
// written by the AI, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const NID = 'crewC1';
const WORDS = 'Hole looks too small for the made-up bolt';
const SPOT = 'Hole looks'.length;
const PAT_WORDS = 'Check: ';

// A made-up wedge: one triangle, as a plain-text 3D printing file.
const STL = Buffer.from([
  'solid wedge',
  'facet normal 0 0 1', 'outer loop', 'vertex 0 0 0', 'vertex 20 0 0', 'vertex 0 20 0', 'endloop', 'endfacet',
  'endsolid wedge',
].join('\n')).toString('base64');

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Note text' });
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const textOf = async (page, id) => String((await readWindow(page, id))?.[`m3n.${NID}`]?.text ?? '');

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function open(page, id) {
  if (await box(page, id).count()) return;
  await windowFrame(page, id).locator('.hb-y3d-note .hb-cr-layer-name').first().click({ timeout: 15_000 });
  await box(page, id).waitFor({ timeout: 10_000 });
}

const markAt = async (page, id, name) => {
  const m = markOf(box(page, id), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'modelNoteCursors',
  label: "3D Viewer: see a teammate's cursor in a note",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up note, and Sam opens it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'yor3d', {
        title: 'Made-up wedge',
        m3Scene: { order: ['crewK1'] },
        'm3.crewK1': { name: 'Made-up wedge', format: 'stl', main: 'wedge.stl', files: { 'wedge.stl': STL }, bytes: STL.length, at: 1 },
        [`m3n.${NID}`]: { model: 'crewK1', p: [5, 5, 0], text: '', by: 'Pat Example', at: 2 },
      }, { x: 40, y: 40 }, { w: 1100, h: 720 });
      await open(pat.page, win);
      await box(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await open(sam.page, win);
      await shot(sam.page, 'sam-sees-the-note');
      if (!ok) throw new Error("Sam's copy of the note does not match");
      return 'Sam has the same note open';
    });

    await check('walk', "Sam puts the cursor after 'Hole looks'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win).press('End');
      await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(box(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Hole looks\", and Sam sees Pat's";
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
      return `Sam's line still sits after "Hole looks" (now letter ${want})`;
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
