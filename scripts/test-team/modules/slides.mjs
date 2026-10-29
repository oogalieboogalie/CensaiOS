// Slides for two people. Pat Example makes a made-up two-slide deck; Sam
// Example sees the same two slides. Then both type on slide 2 at the same
// moment, Pat in the title and Sam in the body, and both screens must keep
// both people's words. Hunt: words with a script tag show as words, both
// add a slide at the same moment (both stay, same order on both screens),
// and Pat removes slide 2 while Sam is still typing on it (it stays gone).
// The log keeps no slide words. All words are made up.

import { spawnWindow, windowFrame, readWindow } from '../../e2e/board.mjs';
import { note } from '../report.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SCRIPT = '<script>window.__madeUpPwned = 169</script><img src=x onerror="window.__madeUpPwned = 169"> made-up subtitle';

/** The deck as this person's board holds it: slides in order, words per box. */
async function deckOn(page, id) {
  const win = (await readWindow(page, id)) || {};
  const slides = Object.fromEntries(Object.entries(win).filter(([k, v]) => k.startsWith('os.') && v).map(([k, v]) => [k.slice(3), v]));
  const order = (win.officeDeck?.order || []).filter((s) => slides[s]);
  const strays = Object.keys(slides).filter((s) => !order.includes(s)).sort((a, b) => (slides[a].at || 0) - (slides[b].at || 0));
  return [...order, ...strays].map((s) => ({ id: s, words: slides[s].blocks.map((b) => b.text || '') }));
}

async function waitDeck(page, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  let deck = [];
  while (Date.now() < until) {
    deck = await deckOn(page, id);
    if (test(deck)) return deck;
    await page.waitForTimeout(300);
  }
  return deck;
}

const stage = (page, id) => windowFrame(page, id).locator('.hb-of-stage');
const showSlide = (page, id, n) => windowFrame(page, id).getByRole('button', { name: `Slide ${n}`, exact: true }).click({ timeout: 10_000 });

/** Opens box `n` of the slide on screen for typing (a double-click) and fills it; returns the box. */
async function typeInto(page, id, n, words) {
  await stage(page, id).locator('.hb-of-sblock[data-type="text"]').nth(n).dblclick({ timeout: 10_000 });
  const box = stage(page, id).getByRole('textbox', { name: 'Slide text' });
  await box.fill(words);
  return box;
}

async function typeAndKeep(page, id, n, words) {
  await (await typeInto(page, id, n, words)).press('Escape');
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default {
  id: 'slides',
  label: 'Slides: two people on one deck',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = {
      cover: `Made-up bakery pitch ${run}`, title2: `Made-up plan ${run}`, body2: `- Made-up oven\n- Made-up van ${run}`,
      patTitle: `Made-up plan from Pat ${run}`, samBody: `- Made-up words from Sam ${run}`, late: `Made-up late words ${run}`,
    };
    t.typed.push(...Object.values(W));
    let win;

    await check('walk', 'Pat makes a made-up two-slide deck', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeSlides', { title: 'Made-up pitch' }, { x: 40, y: 40 }, { w: 960, h: 600 });
      const frame = windowFrame(pat.page, win);
      await frame.getByRole('button', { name: 'Add your first slide' }).click({ timeout: 15_000 });
      await typeAndKeep(pat.page, win, 0, W.cover);
      await frame.getByRole('button', { name: 'Add a slide' }).click();
      await typeAndKeep(pat.page, win, 0, W.title2);
      await typeAndKeep(pat.page, win, 1, W.body2);
      const deck = await waitDeck(pat.page, win, (d) => d.length === 2 && d[1].words.join('|') === `${W.title2}|${W.body2}`);
      await shot(pat.page, 'pat-makes-two-slides');
      if (deck.length !== 2) throw new Error(`the deck has ${deck.length} slide(s)`);
      if (deck[0].words[0] !== W.cover) throw new Error('slide 1 lost its title');
      if (!same(deck[1].words, [W.title2, W.body2])) throw new Error('slide 2 lost its words');
      if (!(await stage(pat.page, win).getByText('Made-up oven').count())) throw new Error('the bullet does not show on the slide');
      return 'two slides: a cover and a titled slide with two bullets';
    });

    await check('walk', 'Sam sees the same two slides', async ({ shot }) => {
      if (!win) throw note('the Slides window never opened');
      const want = await deckOn(pat.page, win);
      const deck = await waitDeck(sam.page, win, (d) => same(d, want));
      await showSlide(sam.page, win, 2);
      await stage(sam.page, win).getByText(W.title2).waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-deck');
      if (!same(deck, want)) throw new Error(`Sam's deck differs from Pat's (${deck.length} slide(s))`);
      if (!(await stage(sam.page, win).getByText(W.title2).count())) throw new Error('Sam\'s screen does not show slide 2');
      return 'Sam has both slides with every word Pat typed';
    });

    await check('walk', 'Pat types the title of slide 2 while Sam types its body; both screens keep both', async ({ shot }) => {
      await showSlide(pat.page, win, 2);
      const [patBox, samBox] = await Promise.all([typeInto(pat.page, win, 0, W.patTitle), typeInto(sam.page, win, 1, W.samBody)]);
      await Promise.all([patBox.press('Escape'), samBox.press('Escape')]);
      const both = (d) => same(d[1]?.words, [W.patTitle, W.samBody]);
      const [patDeck, samDeck] = await Promise.all([waitDeck(pat.page, win, both), waitDeck(sam.page, win, both)]);
      await sideBySide(t, 'both-typed-on-slide-2', shot);
      const problems = [];
      for (const [who, d] of [['Pat', patDeck], ['Sam', samDeck]]) {
        if (d[1]?.words[0] !== W.patTitle) problems.push(`${who}'s screen lost Pat's title`);
        if (d[1]?.words[1] !== W.samBody) problems.push(`${who}'s screen lost Sam's body`);
      }
      if (problems.length) throw new Error(problems.join('; '));
      return 'both screens show Pat\'s new title and Sam\'s new body on slide 2';
    });

    await check('hunt', 'words with a script tag show as words and run nowhere', async ({ shot }) => {
      await showSlide(pat.page, win, 1);
      await typeAndKeep(pat.page, win, 1, SCRIPT);
      await showSlide(sam.page, win, 1);
      await stage(sam.page, win).getByText('made-up subtitle', { exact: false }).waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-script-as-words');
      const problems = [];
      for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
        if (await page.evaluate(() => window.__madeUpPwned)) problems.push(`the script ran on ${who}'s screen`);
      }
      if (!(await stage(sam.page, win).innerText()).includes('<script>')) problems.push('Sam does not see the tag as words');
      if (problems.length) throw new Error(problems.join('; '));
      return 'both screens show the tag as plain words; nothing ran';
    });

    await check('hunt', 'Pat and Sam each add a slide at the same moment; both stay, in the same order', async ({ shot }) => {
      await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).getByRole('button', { name: 'Add a slide' }).click()));
      const four = (d) => d.length === 4;
      const [patDeck, samDeck] = await Promise.all([waitDeck(pat.page, win, four), waitDeck(sam.page, win, four)]);
      await sideBySide(t, 'both-added-a-slide', shot);
      if (patDeck.length !== 4 || samDeck.length !== 4) throw new Error(`Pat has ${patDeck.length} slides and Sam ${samDeck.length}`);
      if (!same(patDeck.map((s) => s.id), samDeck.map((s) => s.id))) throw new Error('the slides are in a different order on the two screens');
      const thumbs = await Promise.all([pat, sam].map((p) => windowFrame(p.page, win).locator('.hb-of-thumb').count()));
      if (thumbs.some((n) => n !== 4)) throw new Error(`the slide list shows ${thumbs.join(' and ')} slides`);
      return 'four slides on both screens, in the same order';
    });

    await check('hunt', 'Pat removes slide 2 while Sam is typing on it; it stays gone on both screens', async ({ shot }) => {
      const before = await deckOn(pat.page, win);
      const gone = before[1]?.id;
      await Promise.all([showSlide(pat.page, win, 2), showSlide(sam.page, win, 2)]);
      const samBox = await typeInto(sam.page, win, 1, W.late);
      await Promise.all([
        windowFrame(pat.page, win).getByRole('button', { name: 'Remove slide' }).click({ timeout: 10_000 }),
        samBox.press('Escape'),
      ]);
      await pat.page.waitForTimeout(3000);
      const [patDeck, samDeck] = await Promise.all([deckOn(pat.page, win), deckOn(sam.page, win)]);
      await sideBySide(t, 'after-pat-removes-slide-2', shot);
      const problems = [];
      if (!same(patDeck, samDeck)) problems.push(`Pat has ${patDeck.length} slides and Sam ${samDeck.length}`);
      if ([...patDeck, ...samDeck].some((s) => s.id === gone)) problems.push('the removed slide came back');
      if (problems.length) throw new Error(problems.join('; '));
      return `both screens hold the same ${patDeck.length} slides; the removed one stays gone`;
    });

    await check('redteam', 'the log keeps no slide words', async () => {
      const words = [W.cover, W.patTitle, W.late, 'made-up subtitle', 'Made-up oven', 'Made-up words from Sam'];
      const bad = t.serverLog().split('\n').filter((line) => words.some((w) => line.includes(w)));
      if (bad.length) throw new Error(`${bad.length} log lines carry slide words`);
      return 'no log line carries a slide title or text';
    });
  },
};
