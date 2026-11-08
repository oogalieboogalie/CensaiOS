// Outbox drafts for two people. The window opens with one made-up email an
// agent drafted. Pat Example and Sam Example both click Edit on it. Sam puts
// the cursor after "Hi Sam" in the message; Pat must see a line with Sam's
// name there. Then Pat types at the start while Sam types at the end, at the
// same moment: both screens must show every word whole (before, the words
// stayed on one screen until Save, and the last Save wiped out the other's),
// and Sam's line must move with Sam's words. When Sam clicks away, it leaves
// Pat's screen. All people and words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const BODY = 'Hi Sam, thanks for coming to the open house.';
const SPOT = 'Hi Sam'.length;
const PAT_WORDS = 'Hello! ';
const SAM_WORDS = ' See you soon.';
const DRAFT = { id: 'd1', status: 'pending', channel: 'email', to: 'Sam Example', address: 'sam@example.com', subject: 'Thanks for visiting', body: BODY, agentName: 'Follow-up Assistant', createdAt: '2026-11-01T10:00:00Z' };

const message = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Message' });
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const bodyOf = async (page, id) => (await readWindow(page, id))?.drafts?.[0]?.body;

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}
const markAt = async (page, id, name) => {
  const m = markOf(message(page, id), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'outboxCursors',
  label: "Outbox: rewrite a draft together and see a teammate's cursor",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS.trim(), SAM_WORDS.trim());
    let win;

    await check('walk', 'A made-up draft opens and both click Edit on it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'outbox', { drafts: [DRAFT] }, { x: 40, y: 40 }, { w: 640, h: 560 });
      for (const p of [pat, sam]) {
        const edit = windowFrame(p.page, win).getByRole('button', { name: 'Edit' });
        await edit.waitFor({ timeout: 15_000 });
        await edit.click();
        await message(p.page, win).waitFor({ timeout: 15_000 });
      }
      await shot(sam.page, 'sam-edits-the-draft');
      if ((await message(sam.page, win).inputValue()) !== BODY) throw new Error("Sam's message does not match");
      return 'Both have the same message open to rewrite';
    });

    await check('walk', "Sam puts the cursor after 'Hi Sam'; Pat sees Sam's name there", async ({ shot }) => {
      await message(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await message(pat.page, win).press('Shift');
      await message(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await message(sam.page, win).press('Shift');
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!ok) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(message(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Hi Sam\", and Sam sees Pat's";
    });

    await check('walk', 'Pat types at the start while Sam types at the end; both keep every word', async ({ shot }) => {
      await message(sam.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await message(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await Promise.all([
        message(pat.page, win).pressSequentially(PAT_WORDS, { delay: 40 }),
        message(sam.page, win).pressSequentially(SAM_WORDS, { delay: 40 }),
      ]);
      const want = `${PAT_WORDS}${BODY}${SAM_WORDS}`;
      const seen = await waitFor(async () => {
        const all = await Promise.all([pat, sam].map(async (p) => [await bodyOf(p.page, win), await message(p.page, win).inputValue()]));
        return all.flat().every((v) => v === want) ? all : null;
      }, 15_000, pat.page);
      await sideBySide(t, 'both-keep-their-words', shot);
      if (!seen) throw new Error(`Words differ: Pat ${JSON.stringify(await message(pat.page, win).inputValue())}, Sam ${JSON.stringify(await message(sam.page, win).inputValue())}`);
      const samAt = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(want.length) ? 'ok' : null), 15_000, pat.page);
      if (!samAt) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want.length}`);
      return `Both screens read "${want}", and Sam's line sits at the end, after Sam's words`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await message(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(message(pat.page, win), 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
