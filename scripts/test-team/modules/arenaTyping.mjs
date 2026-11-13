// Model Arena typing for two people. Pat Example types a made-up request and
// Sam Example sees it while Pat types (before, it stayed on Pat's screen until
// a race ended). Then, at the same moment, Pat types at the start of the
// request while Sam types at the end of it: both people's words must be whole
// on both screens, and Pat's cursor must stay right after Pat's own words.
// Nothing is raced, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const promptOf = async (page, id) => (await readWindow(page, id))?.prompt ?? '';

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => promptOf(p.page, id)));
    if (seen.every((s) => s === want) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const requestBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Request to send to every model' });

export default {
  id: 'arenaTyping',
  label: 'Model Arena: two people type in one request at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `name three made-up towns ${run}`, pat: 'Please ', sam: ', one line each' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/^[ ,:]+|[ ,:]+$/g, '')));
    let win;

    await check('walk', 'Pat types a made-up request and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'modelArena', {}, { x: 40, y: 40 }, { w: 1100, h: 640 });
      await requestBox(pat.page, win).click({ timeout: 15_000 });
      await requestBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, W.start);
      await requestBox(sam.page, win).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-request');
      if (samSaw !== W.start) throw new Error(`Sam's copy reads "${samSaw}"`);
      const onScreen = await requestBox(sam.page, win).inputValue();
      if (onScreen !== W.start) throw new Error(`Sam's request box shows "${onScreen}"`);
      return 'Sam has the same request, letter for letter, in the box';
    });

    await check('walk', 'Pat and Sam type in the request at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [requestBox(pat.page, win), requestBox(sam.page, win)];
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
      if (bad !== undefined) throw new Error(`a screen's request reads "${bad}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one request with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
