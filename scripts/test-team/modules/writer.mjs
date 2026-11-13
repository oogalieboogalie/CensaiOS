// Writer (office Docs) for two people. Pat Example writes a made-up
// paragraph and Sam Example sees it on the shared board. Then both type in
// that same paragraph at once, Pat at the start and Sam at the end: both
// screens must agree, both people's words must be whole, and Pat's caret
// must stay right after Pat's own words. Hunt: Pat turns the paragraph into
// a heading while Sam is still typing in it (both changes stay), and words
// with a script tag show as words and run nowhere. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const TAG = ' <script>window.__madeUpPwned = 1</script> made-up tag';

/** The first paragraph as this person's board holds it. */
async function firstBlock(page, id) {
  const win = (await readWindow(page, id)) || {};
  const live = (b) => win[`ob.${b}`];
  const first = (win.officeDoc?.order || []).find(live)
    || Object.keys(win).filter((k) => k.startsWith('ob.') && win[k]).map((k) => k.slice(3))[0];
  return first ? live(first) : null;
}

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => firstBlock(p.page, id)));
    if (seen.every((b) => b && test(b)) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

/** Opens the first paragraph for typing on this person's screen. */
async function openParagraph(page, id) {
  const frame = windowFrame(page, id);
  await frame.locator('.hb-of-block .hb-of-text').first().click({ timeout: 10_000 });
  const box = frame.locator('textarea.hb-of-text').first();
  await box.waitFor({ timeout: 10_000 });
  return box;
}

export default {
  id: 'writer',
  label: 'Writer: two people type in one paragraph',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { para: `Made-up plan for the bake sale ${run}`, pat: 'Pat: ', sam: ' (Sam)', late: ' and more' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat writes a made-up paragraph and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeDocs', { title: 'Made-up plan' }, { x: 40, y: 40 }, { w: 820, h: 560 });
      await windowFrame(pat.page, win).getByRole('button', { name: 'Start writing' }).click({ timeout: 15_000 });
      await windowFrame(pat.page, win).locator('textarea.hb-of-text').first().pressSequentially(W.para, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, (b) => b.text === W.para);
      await windowFrame(sam.page, win).getByText(W.para).waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-paragraph');
      if (samSaw?.text !== W.para) throw new Error(`Sam's copy reads "${samSaw?.text ?? ''}"`);
      return 'Sam has the same paragraph, word for word';
    });

    await check('walk', 'Pat and Sam type in one paragraph at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [await openParagraph(pat.page, win), await openParagraph(sam.page, win)];
      await patBox.evaluate((el) => el.setSelectionRange(0, 0));
      await samBox.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.para}${W.sam}`;
      const [patSaw, samSaw] = await bothSee(t, win, (b) => b.text === want);
      await sideBySide(t, 'both-typed-in-one-paragraph', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      if (patSaw?.text !== samSaw?.text) throw new Error(`the screens disagree: Pat "${patSaw?.text}", Sam "${samSaw?.text}"`);
      if (patSaw?.text !== want) throw new Error(`the paragraph reads "${patSaw?.text}"`);
      if (caret !== W.pat) throw new Error(`Pat's caret moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same paragraph with Pat's and Sam's words whole; Pat's caret stayed after Pat's words";
    });

    await check('hunt', 'Pat makes the paragraph a heading while Sam types in it; both changes stay', async ({ shot }) => {
      const samBox = windowFrame(sam.page, win).locator('textarea.hb-of-text').first();
      await samBox.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
      await Promise.all([
        windowFrame(pat.page, win).getByLabel('Paragraph style').selectOption('h1'),
        samBox.pressSequentially(W.late, { delay: 30 }),
      ]);
      const want = `${W.pat}${W.para}${W.sam}${W.late}`;
      const seen = await bothSee(t, win, (b) => b.type === 'h1' && b.text === want);
      await sideBySide(t, 'heading-while-typing', shot);
      const bad = seen.filter((b) => b?.type !== 'h1' || b?.text !== want);
      if (bad.length) throw new Error(`a screen holds type "${bad[0]?.type}" with "${bad[0]?.text}"`);
      return 'both screens show one heading with every word Sam typed';
    });

    await check('redteam', 'words with a script tag show as words and run nowhere', async ({ shot }) => {
      const patBox = windowFrame(pat.page, win).locator('textarea.hb-of-text').first();
      await patBox.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
      await patBox.pressSequentially(TAG, { delay: 5 });
      await patBox.press('Escape');
      await bothSee(t, win, (b) => b.text.endsWith(TAG));
      await windowFrame(sam.page, win).getByText('made-up tag', { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'script-tag-shows-as-words');
      const ran = await Promise.all([pat.page, sam.page].map((p) => p.evaluate(() => window.__madeUpPwned === 1)));
      if (ran.some(Boolean)) throw new Error('the script ran');
      if (!(await windowFrame(sam.page, win).getByText('<script>', { exact: false }).count())) throw new Error('Sam does not see the tag as words');
      return 'Sam sees the tag as plain words; it ran on neither screen';
    });
  },
};
