// Git Diff Viewer typing for two people. Pat Example pastes a made-up old
// version into Before and Sam Example sees it. Then, at the same moment, Pat
// types at the start of Before while Sam types at the end of it: both
// people's words must be whole on both screens, and Pat's cursor must stay
// right after Pat's own words. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const beforeOf = async (page, id) => (await readWindow(page, id))?.diffBefore ?? '';

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => beforeOf(p.page, id)));
    if (seen.every((s) => s === want) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const beforeBox = (page, id) => windowFrame(page, id).getByTestId('gdv-before');

export default {
  id: 'gitDiffTyping',
  label: 'Git Diff Viewer: two people type in one version at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `flour 2 cups ${run}`, pat: 'Made-up recipe: ', sam: ', bake 20 minutes' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/^[ ,:]+|[ ,:]+$/g, '')));
    let win;

    await check('walk', 'Pat types a made-up old version and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'gitDiff', {}, { x: 40, y: 40 }, { w: 1000, h: 600 });
      await beforeBox(pat.page, win).click({ timeout: 15_000 });
      await beforeBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, W.start);
      await beforeBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-old-version');
      if (samSaw !== W.start) throw new Error(`Sam's copy reads "${samSaw}"`);
      return 'Sam has the same words, letter for letter';
    });

    await check('walk', 'Pat and Sam type in Before at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [beforeBox(pat.page, win), beforeBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => s !== want);
      if (bad !== undefined) throw new Error(`a screen's Before reads "${bad}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one version with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
