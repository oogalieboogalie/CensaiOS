// Live cursors in Writer paragraphs for two people. Pat Example writes a
// made-up paragraph; Sam Example clicks into it and puts the cursor after
// "Made-up". While Pat is only reading, Pat sees Sam's name tag on that
// paragraph. When Pat clicks in too, Pat sees a line with Sam's name at that
// spot, and when Pat types in front of it the line moves with Sam's words.
// When Sam clicks away, it leaves Pat's screen. Nothing is written by the
// AI, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Made-up plan for the bake sale on Friday';
const SPOT = 'Made-up'.length;
const PAT_WORDS = 'Note: ';

const frame = (page, id) => windowFrame(page, id);
const typingBox = (page, id) => frame(page, id).locator('textarea.hb-of-text').first();
const tagOf = (page, id, name) => frame(page, id).locator(`.hb-of-here [data-teammate-caret="${name}"]`);
const lineOf = (page, id, name) => typingBox(page, id).locator('xpath=..').locator(`.hb-text-caret[data-teammate-caret="${name}"]`);

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const atOf = async (loc) => ((await loc.count()) ? loc.first().getAttribute('data-at') : null);

async function firstText(page, id) {
  const win = (await readWindow(page, id)) || {};
  const key = Object.keys(win).find((k) => k.startsWith('ob.') && win[k]);
  return key ? String(win[key].text ?? '') : '';
}

async function openParagraph(page, id) {
  await frame(page, id).locator('.hb-of-block .hb-of-text').first().click({ timeout: 10_000 });
  await typingBox(page, id).waitFor({ timeout: 10_000 });
  return typingBox(page, id);
}

export default {
  id: 'writerCursors',
  label: "Writer: see a teammate's cursor in a paragraph",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat writes a made-up paragraph, and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeDocs', { title: 'Made-up plan' }, { x: 40, y: 40 }, { w: 820, h: 560 });
      await frame(pat.page, win).getByRole('button', { name: 'Start writing' }).click({ timeout: 15_000 });
      await typingBox(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      // Pat clicks the empty desk around the page, so the paragraph shows as read-only words.
      await frame(pat.page, win).locator('.hb-of-scroll').first().dispatchEvent('mousedown');
      await frame(pat.page, win).locator('textarea.hb-of-text').waitFor({ state: 'detached', timeout: 10_000 });
      const ok = await waitFor(async () => (await firstText(sam.page, win)) === WORDS, 15_000, pat.page);
      await frame(sam.page, win).getByText(WORDS).waitFor({ timeout: 15_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-paragraph');
      if (!ok) throw new Error("Sam's copy of the paragraph does not match");
      return 'Sam has the same paragraph';
    });

    await check('walk', "Sam puts the cursor after 'Made-up'; Pat, only reading, sees Sam's name on the paragraph", async ({ shot }) => {
      const samBox = await openParagraph(sam.page, win);
      await samBox.evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await samBox.press('Shift');
      const at = await waitFor(async () => ((await atOf(tagOf(pat.page, win, 'Sam Example'))) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-name-tag', shot);
      if (!at) throw new Error(`Pat sees Sam's tag at ${(await atOf(tagOf(pat.page, win, 'Sam Example'))) ?? 'nowhere'}, not ${SPOT}`);
      return "Pat sees Sam's name tag on the paragraph Sam is typing in";
    });

    await check('walk', "Pat clicks in too; Sam's cursor shows at the letter, and moves with Sam's words", async ({ shot }) => {
      const patBox = await openParagraph(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      const seen = await waitFor(async () => ((await atOf(lineOf(pat.page, win, 'Sam Example'))) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      if (!seen) throw new Error(`Pat sees Sam's line at ${(await atOf(lineOf(pat.page, win, 'Sam Example'))) ?? 'nowhere'}, not ${SPOT}`);
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await atOf(lineOf(pat.page, win, 'Sam Example'))) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's line sits at ${await atOf(lineOf(pat.page, win, 'Sam Example'))}, not ${want}`);
      if (!(await lineOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return `Sam's line still sits after "Made-up" (now letter ${want}), and Sam sees Pat's`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await typingBox(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await lineOf(pat.page, win, 'Sam Example').count()) === 0
        && (await tagOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
