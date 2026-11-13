// Window names for two people. Pat Example makes a made-up Writer document
// and Sam Example sees its title on the shared board. Then, at the same
// moment, Pat types at the start of the title while Sam types at the end:
// both people's words must be whole on both screens, and Pat's cursor must
// stay right after Pat's own words. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const titleOf = async (page, id) => (await readWindow(page, id))?.title ?? '';

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => titleOf(p.page, id)));
    if (seen.every((s) => s === want) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const titleBox = (page, id) => windowFrame(page, id).getByLabel('Document title', { exact: true });

export default {
  id: 'windowTitle',
  label: 'Window names: two people rename one Writer document at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Bake sale plan ${run}`, pat: 'Spring ', sam: ', draft 2' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/^[ ,]+|[ ,]+$/g, '')));
    let win;

    await check('walk', 'Pat names a made-up document and Sam sees the name', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeDocs', { title: '' }, { x: 40, y: 40 }, { w: 820, h: 560 });
      await titleBox(pat.page, win).click({ timeout: 15_000 });
      await titleBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, W.start);
      await titleBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-name');
      if (samSaw !== W.start) throw new Error(`Sam's copy reads "${samSaw}"`);
      return 'Sam has the same name, letter for letter';
    });

    await check('walk', 'Pat and Sam rename at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [titleBox(pat.page, win), titleBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-renamed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => s !== want);
      if (bad !== undefined) throw new Error(`a screen's title reads "${bad}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one name with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
