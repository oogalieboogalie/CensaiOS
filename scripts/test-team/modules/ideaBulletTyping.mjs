// Idea Pad bullet typing for two people. Pat Example adds a made-up bullet
// and Sam Example sees it. Then, at the same moment, Pat types at the start
// of that bullet while Sam types at the end of it: both people's words must
// be whole on both screens, the pad must still hold one bullet (before, the
// bullet was swapped whole, so it came out doubled or lost someone's
// letters), and Pat's cursor must stay right after Pat's own words. Nothing
// is saved to a project, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const bulletsOf = async (page, id) => (await readWindow(page, id))?.ideas ?? [];

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => bulletsOf(p.page, id)));
    if (seen.every((s) => JSON.stringify(s) === JSON.stringify(want)) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const bulletBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Idea bullet 1' });

export default {
  id: 'ideaBulletTyping',
  label: 'Idea Pad: two people type in one bullet at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Rye loaves on the front page ${run}`, pat: 'Big photo of ', sam: ', every Sunday' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat adds a made-up bullet and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'idea', {}, { x: 40, y: 40 }, { w: 960, h: 620 });
      const add = windowFrame(pat.page, win).getByPlaceholder('Add a thought...');
      await add.click({ timeout: 15_000 });
      await add.pressSequentially(W.start, { delay: 10 });
      await add.press('Enter');
      const [, samSaw] = await bothSee(t, win, [W.start]);
      await bulletBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-bullet');
      if (JSON.stringify(samSaw) !== JSON.stringify([W.start])) throw new Error(`Sam's bullets read ${JSON.stringify(samSaw)}`);
      const onScreen = await bulletBox(sam.page, win).inputValue();
      if (onScreen !== W.start) throw new Error(`Sam's bullet shows "${onScreen}"`);
      return 'Sam has the same bullet, letter for letter';
    });

    await check('walk', 'Pat and Sam type in one bullet at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [bulletBox(pat.page, win), bulletBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = [`${W.pat}${W.start}${W.sam}`];
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => JSON.stringify(s) !== JSON.stringify(want));
      if (bad !== undefined) throw new Error(`a screen's bullets read ${JSON.stringify(bad)}`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens hold one bullet with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
