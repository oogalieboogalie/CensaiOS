// Local Sites typing for two people. At the same moment Pat Example types at
// the start of a made-up shop's About while Sam Example types at its end, and
// Sam fixes the phone: every word must be whole on both screens (before, the
// whole form was saved as one piece, so the last one to type replaced the
// other's), and Pat's cursor must stay right after Pat's own words. Nothing
// is downloaded or put online. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const siteOf = async (page, id) => (await readWindow(page, id))?.site || {};

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  const fits = (s) => Object.entries(want).every(([k, v]) => s[k] === v);
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => siteOf(p.page, id)));
    if (seen.every(fits) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

// A box's label holds its words too, so find the box by the label's own title.
const box = (page, id, title, tag) => windowFrame(page, id).locator('label.hb-ls-field')
  .filter({ has: page.locator(`span:text-is("${title}")`) }).locator(tag);
const aboutBox = (page, id) => box(page, id, 'About', 'textarea');
const phoneBox = (page, id) => box(page, id, 'Phone', 'input');

export default {
  id: 'localSiteTyping',
  label: 'Local Sites: two people fill in one shop at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `We bake bread every morning ${run}`, pat: 'Fresh: ', sam: ' and on Sundays', phone: '555-0142' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/^[ ,:]+|[ ,:]+$/g, '')));
    let win;

    await check('walk', 'Pat types the About and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'localSites', { site: { preset: 'bakery' } }, { x: 40, y: 50 }, { w: 1080, h: 700 });
      await aboutBox(pat.page, win).fill(W.start, { timeout: 15_000 });
      const [, samSaw] = await bothSee(t, win, { about: W.start });
      await shot(sam.page, 'sam-sees-the-about');
      if (samSaw.about !== W.start) throw new Error(`Sam's copy reads "${samSaw.about ?? ''}"`);
      return 'Sam has the same About, letter for letter';
    });

    await check('walk', 'Pat and Sam type in the form at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [aboutBox(pat.page, win), aboutBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      await phoneBox(sam.page, win).fill(W.phone);
      const want = { about: `${W.pat}${W.start}${W.sam}`, phone: W.phone };
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => s.about !== want.about || s.phone !== want.phone);
      if (bad) throw new Error(`a screen's form reads "${bad.about ?? ''}" / "${bad.phone ?? ''}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one form with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
