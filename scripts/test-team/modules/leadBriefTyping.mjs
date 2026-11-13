// LeadHound brief typing for two people. Pat Example types a made-up business
// and Sam Example sees it while Pat types (before, it stayed on Pat's screen
// until Find leads). Then, at the same moment, Pat types at the start of the
// business while Sam types at the end, and Sam fills the region: every word
// must be whole on both screens, and Pat's cursor must stay right after Pat's
// own words. No hunt runs, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const briefOf = async (page, id) => (await readWindow(page, id))?.leadBrief || {};

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  const fits = (b) => Object.entries(want).every(([k, v]) => b[k] === v);
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => briefOf(p.page, id)));
    if (seen.every(fits) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const businessBox = (page, id) => windowFrame(page, id).getByPlaceholder(/AI receptionists for dental clinics/);
const regionBox = (page, id) => windowFrame(page, id).getByLabel('Region');

export default {
  id: 'leadBriefTyping',
  label: 'LeadHound: two people fill in one brief at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `We bake bread for Pat Example Cafe ${run}`, pat: 'Fresh: ', sam: ' and diners', region: 'Exampleton' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/^[ ,:]+|[ ,:]+$/g, '')));
    let win;

    await check('walk', 'Pat types a made-up business and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'leadHound', {}, { x: 40, y: 40 }, { w: 1000, h: 720 });
      await businessBox(pat.page, win).click({ timeout: 15_000 });
      await businessBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, { business: W.start });
      await shot(sam.page, 'sam-sees-the-brief');
      if (samSaw.business !== W.start) throw new Error(`Sam's copy reads "${samSaw.business ?? ''}"`);
      const onScreen = await businessBox(sam.page, win).inputValue();
      if (onScreen !== W.start) throw new Error(`Sam's business box shows "${onScreen}"`);
      return 'Sam has the same business, letter for letter, in the box';
    });

    await check('walk', 'Pat and Sam type in the brief at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [businessBox(pat.page, win), businessBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      await regionBox(sam.page, win).pressSequentially(W.region, { delay: 15 });
      const want = { business: `${W.pat}${W.start}${W.sam}`, region: W.region };
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((b) => b.business !== want.business || b.region !== want.region);
      if (bad) throw new Error(`a screen's brief reads "${bad.business ?? ''}" / "${bad.region ?? ''}"`);
      const patRegion = await regionBox(pat.page, win).inputValue();
      if (patRegion !== W.region) throw new Error(`Pat's region box shows "${patRegion}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one brief with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
