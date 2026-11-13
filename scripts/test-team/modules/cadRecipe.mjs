// YorWare CAD recipe for two people. Pat Example starts a made-up part and
// Sam Example sees it. Both open the recipe and change it at once: Pat adds
// a note at the top and keeps it unsaved, Sam adds one at the bottom and
// runs it. Pat's unsaved copy must take in Sam's line with Pat's caret kept
// after Pat's own words, and when Pat runs, both screens must hold both
// lines. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const recipeOf = async (page, id) => String((await readWindow(page, id))?.cadCode || '');

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => recipeOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

async function openRecipe(page, id) {
  const frame = windowFrame(page, id);
  await frame.getByRole('button', { name: 'Show the code that makes this part' }).click({ timeout: 15_000 });
  const box = frame.getByLabel('Recipe code');
  await box.waitFor({ timeout: 10_000 });
  return box;
}

export default {
  id: 'cadRecipe',
  label: 'CAD: two people change one recipe',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { pat: `// Pat: made-up note ${run}\n`, sam: `\n// Sam: made-up note ${run}` };
    t.typed.push(W.pat.trim(), W.sam.trim());
    let win;
    let start = '';

    await check('walk', 'Pat starts a made-up part and Sam sees the same recipe', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'yorCad', { title: 'Made-up part' }, { x: 40, y: 40 }, { w: 900, h: 600 });
      await windowFrame(pat.page, win).getByRole('button', { name: /Rounded block/ }).click({ timeout: 15_000 });
      const [patSaw, samSaw] = await bothSee(t, win, (c) => c.includes('function main'));
      start = patSaw;
      await shot(sam.page, 'sam-sees-the-part');
      if (!start || samSaw !== start) throw new Error('Sam does not have the same recipe');
      return 'Sam has the same recipe, letter for letter';
    });

    await check('walk', 'Sam runs a change while Pat still edits; Pat keeps both', async ({ shot }) => {
      const [patBox, samBox] = [await openRecipe(pat.page, win), await openRecipe(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(W.pat, { delay: 15 });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await samBox.pressSequentially(W.sam, { delay: 15 });
      await windowFrame(sam.page, win).getByRole('button', { name: 'Run', exact: true }).click();
      await bothSee(t, win, (c) => c.endsWith(W.sam));
      const want = `${W.pat}${start}${W.sam}`;
      const until = Date.now() + 10_000;
      while ((await patBox.inputValue()) !== want && Date.now() < until) await pat.page.waitForTimeout(200);
      const patCopy = await patBox.inputValue();
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      await sideBySide(t, 'sam-ran-while-pat-edits', shot);
      if (patCopy !== want) throw new Error("Pat's unsaved copy lost a line");
      if (caret !== W.pat) throw new Error(`Pat's caret moved: it sits after "${caret.slice(-24)}"`);
      return "Pat's unsaved copy shows Sam's line too; Pat's caret stayed after Pat's words";
    });

    await check('walk', "Pat runs; both screens hold both people's lines", async ({ shot }) => {
      await windowFrame(pat.page, win).getByRole('button', { name: 'Run', exact: true }).click();
      const want = `${W.pat}${start}${W.sam}`;
      const seen = await bothSee(t, win, (c) => c === want);
      await sideBySide(t, 'both-lines-on-both-screens', shot);
      if (seen.some((c) => c !== want)) throw new Error('a screen is missing a line');
      return "both boards read the same recipe with Pat's and Sam's lines";
    });
  },
};
