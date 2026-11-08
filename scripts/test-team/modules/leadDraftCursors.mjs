// Live cursors in LeadHound drafts for two people. The window opens on a
// made-up hunt (no search runs, so no key is needed). Sam Example puts the
// cursor after "Hi Sam" in the Day 1 message; Pat Example must see a line
// with Sam's name there, only in that message, and when Pat types in front
// of it the line must move with Sam's words. When Sam clicks away, it leaves
// Pat's screen. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const DAY1 = 'Hi Sam, we bake rye bread every morning.';
const SPOT = 'Hi Sam'.length;
const PAT_WORDS = 'Note: ';
const LEAD = {
  company: 'Sam Example Cafe', url: 'https://cafe.example', host: 'cafe.example', fitScore: 88,
  why_fit: 'Busy weekend cafe with no bakery yet.',
  sequence: [
    { day: 1, channel: 'email', subject: 'Fresh bread', body: DAY1 },
    { day: 3, channel: 'email', subject: 'Samples', body: 'Following up on the rye bread samples.' },
  ],
  iceBreaker: { title: 'Weekend bread menu', opening_line: 'Your line is out the door.', deliverable: '- Rye', cta: 'Can I drop off a loaf?' },
};
const BRIEF = { business: 'Pat Example Bakery', market: 'Small cafes', region: 'Exampleton', maxLeads: 1 };
const HUNT = { brief: BRIEF, result: { brief: BRIEF, leads: [LEAD], candidates: [], usage: {} } };

const dayBox = (page, id, day) => windowFrame(page, id).getByRole('textbox', { name: `Day ${day} message` });
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, name) => {
  const m = markOf(dayBox(page, id, 1), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'leadDraftCursors',
  label: "LeadHound: see a teammate's cursor in a lead's drafts",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS.trim());
    let win;

    await check('walk', 'A made-up hunt opens and both see the Day 1 message', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'leadHound', { leadHound: HUNT }, { x: 40, y: 40 }, { w: 1000, h: 720 });
      await dayBox(pat.page, win, 1).waitFor({ timeout: 15_000 });
      await dayBox(sam.page, win, 1).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-drafts');
      if ((await dayBox(sam.page, win, 1).inputValue()) !== DAY1) throw new Error("Sam's Day 1 message does not match");
      return 'Both see the same Day 1 message';
    });

    await check('walk', "Sam puts the cursor after 'Hi Sam'; Pat sees Sam's name there", async ({ shot }) => {
      await dayBox(pat.page, win, 1).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await dayBox(pat.page, win, 1).press('End');
      await dayBox(sam.page, win, 1).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await dayBox(sam.page, win, 1).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(dayBox(sam.page, win, 1), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      if (await markOf(dayBox(pat.page, win, 3), 'Sam Example').count()) throw new Error("Sam's cursor shows in Day 3 too");
      return "Pat sees a line with Sam's name right after \"Hi Sam\", only in Day 1, and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = dayBox(pat.page, win, 1);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Hi Sam" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await dayBox(sam.page, win, 1).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(dayBox(pat.page, win, 1), 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
