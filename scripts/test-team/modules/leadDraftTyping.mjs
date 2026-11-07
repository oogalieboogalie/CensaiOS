// LeadHound draft typing for two people. The window opens on a made-up hunt
// (no search runs, so no key is needed). Pat Example adds words to the Day 1
// message and Sam Example sees them while Pat types (before, every letter
// saved the whole hunt as one piece). Then, at the same moment, Pat types at
// the start of the Day 1 message while Sam types at its end, and Sam rewrites
// the Day 3 message: every word must be whole on both screens, and Pat's
// cursor must stay right after Pat's own words. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const DAY1 = 'Hi Sam, we bake rye bread every morning.';
const DAY3 = 'Following up on the rye bread samples.';
const LEAD = {
  company: 'Sam Example Cafe', url: 'https://cafe.example', host: 'cafe.example', fitScore: 88,
  why_fit: 'Busy weekend cafe with no bakery yet.',
  sequence: [
    { day: 1, channel: 'email', subject: 'Fresh bread', body: DAY1 },
    { day: 3, channel: 'email', subject: 'Samples', body: DAY3 },
  ],
  iceBreaker: { title: 'Weekend bread menu', opening_line: 'Your line is out the door on Saturdays.', deliverable: '- Rye\n- Sourdough', cta: 'Can I drop off a loaf?' },
};
const BRIEF = { business: 'Pat Example Bakery', market: 'Small cafes', region: 'Exampleton', maxLeads: 1 };
const HUNT = { brief: BRIEF, result: { brief: BRIEF, leads: [LEAD], candidates: [], usage: {} } };

const bodiesOf = async (page, id) => ((await readWindow(page, id))?.leadHound?.result?.leads?.[0]?.sequence || []).map((t) => t.body);

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => bodiesOf(p.page, id)));
    if (seen.every((b) => b.join('|') === want.join('|')) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const dayBox = (page, id, day) => windowFrame(page, id).getByLabel(`Day ${day} message`);

export default {
  id: 'leadDraftTyping',
  label: "LeadHound: two people rewrite one lead's drafts at once",
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { more: ` Fresh loaves ${run}.`, pat: 'Hello! ', sam: ' - Sam Example', day3: ' Any thoughts?' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/^[ ,:!.-]+|[ ,:!.-]+$/g, '')));
    let win;
    const start = `${DAY1}${W.more}`;

    await check('walk', 'Pat adds to the Day 1 message and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'leadHound', { leadHound: HUNT }, { x: 40, y: 40 }, { w: 1000, h: 720 });
      const box = dayBox(pat.page, win, 1);
      await box.click({ timeout: 15_000 });
      await box.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
      await box.pressSequentially(W.more, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, [start, DAY3]);
      await dayBox(sam.page, win, 1).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-message');
      if (samSaw[0] !== start) throw new Error(`Sam's copy reads "${samSaw[0] ?? ''}"`);
      const onScreen = await dayBox(sam.page, win, 1).inputValue();
      if (onScreen !== start) throw new Error(`Sam's Day 1 box shows "${onScreen}"`);
      return 'Sam has the same Day 1 message, letter for letter, in the box';
    });

    await check('walk', 'Pat and Sam type in the drafts at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [dayBox(pat.page, win, 1), dayBox(sam.page, win, 1)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const sam3 = dayBox(sam.page, win, 3);
      await sam3.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await sam3.pressSequentially(W.day3, { delay: 15 });
      const want = [`${W.pat}${start}${W.sam}`, `${DAY3}${W.day3}`];
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((b) => b.join('|') !== want.join('|'));
      if (bad) throw new Error(`a screen's drafts read "${bad.join('" / "')}"`);
      const pat3 = await dayBox(pat.page, win, 3).inputValue();
      if (pat3 !== want[1]) throw new Error(`Pat's Day 3 box shows "${pat3}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same drafts with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
