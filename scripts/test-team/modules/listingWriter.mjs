// Listing Writer for two people. Pat Example starts a made-up listing and
// Sam Example sees it on the shared board. Then, at the same moment, Pat
// types the features while Sam fixes the price: both changes must stay on
// both screens. Then both type in the features box at once, Pat at the start
// and Sam at the end: both people's words must be whole, and Pat's cursor
// must stay right after Pat's own words. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const formOf = async (page, id) => (await readWindow(page, id))?.listing || {};

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => formOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

// A box's label takes in the words typed in it, so the features box (the
// form's only many-line box) is found by its kind instead.
const box = (page, id, label) => (label === 'Features'
  ? windowFrame(page, id).locator('textarea.re-input')
  : windowFrame(page, id).getByLabel(label, { exact: true }));

export default {
  id: 'listingWriter',
  label: 'Listing Writer: two people fill in one listing',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { address: `14 Made-up Way ${run}`, features: 'Fenced yard', price: '415,000', pat: 'Sunny porch. ', sam: ', two-car garage' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat starts a made-up listing and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'listingWriter', { title: 'Made-up listing' }, { x: 40, y: 40 }, { w: 720, h: 600 });
      await box(pat.page, win, 'Address').pressSequentially(W.address, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, (f) => f.address === W.address);
      await shot(sam.page, 'sam-sees-the-listing');
      if (samSaw.address !== W.address) throw new Error(`Sam's copy reads "${samSaw.address ?? ''}"`);
      return 'Sam has the same address, letter for letter';
    });

    await check('walk', 'Pat types the features while Sam fixes the price; both stay', async ({ shot }) => {
      await Promise.all([
        box(pat.page, win, 'Features').pressSequentially(W.features, { delay: 40 }),
        box(sam.page, win, 'Price').pressSequentially(W.price, { delay: 40 }),
      ]);
      const seen = await bothSee(t, win, (f) => f.features === W.features && f.price === W.price);
      await sideBySide(t, 'features-and-price-at-once', shot);
      const bad = seen.find((f) => f.features !== W.features || f.price !== W.price);
      if (bad) throw new Error(`a screen holds features "${bad.features}" and price "${bad.price}"`);
      return "both screens hold Pat's features and Sam's price";
    });

    await check('walk', 'Pat and Sam type in the features box at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [box(pat.page, win, 'Features'), box(sam.page, win, 'Features')];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.features}${W.sam}`;
      const seen = await bothSee(t, win, (f) => f.features === want);
      await sideBySide(t, 'both-typed-in-features', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((f) => f.features !== want);
      if (bad) throw new Error(`a screen's features read "${bad.features}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same features with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
