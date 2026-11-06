// Teleprompter for two: Pat Example writes a made-up script and Sam Example
// sees it on the shared board. Then both type into the same script at once,
// Pat in the middle and Sam at the end: both screens must agree, both
// people's words must be whole, and Pat's caret must stay right after Pat's
// own words. Sam's change must also reach Pat's pop-out reader (it reads the
// script from this browser's storage). Red team: a script tag typed into the
// script shows as words and runs on neither screen. All words are made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const SCRIPT = 'Made-up opening: welcome to the old mill tour.';
const PAT_INSERT = ' sunny';
const SAM_LINE = ' Made-up closing from Sam: mind the step.';
const TAG = ' <script>window.__madeUpPwned = 1</script> made-up tag line';

const textOf = (page, id) => page.evaluate((wid) => String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? ''), id);
const popOutText = (page) => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('censai.teleprompter.v1') || '{}').text || ''; } catch { return ''; }
});

/** Waits until a check on both people's copies passes; returns what each saw last. */
async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => textOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

/** Opens this person's script box (the window starts in reading mode). */
async function scriptBox(page, id) {
  const frame = windowFrame(page, id);
  const box = frame.getByLabel('Script');
  if (!(await box.count())) await frame.getByRole('button', { name: 'Edit script', exact: true }).click();
  await box.waitFor({ timeout: 10_000 });
  return box;
}

export default {
  id: 'teleprompter',
  label: 'Teleprompter: two people write one script',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(SCRIPT, PAT_INSERT.trim(), SAM_LINE.trim());
    let win;

    await check('walk', 'Pat writes a made-up script and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'teleprompter', { text: '' }, { x: 60, y: 60 }, { w: 720, h: 460 });
      const box = await scriptBox(pat.page, win);
      await box.click();
      await box.pressSequentially(SCRIPT, { delay: 10 });
      const [patSaw, samSaw] = await bothSee(t, win, (s) => s === SCRIPT);
      await shot(sam.page, 'sam-sees-the-script');
      if (samSaw !== SCRIPT) throw new Error(`Sam's copy is "${samSaw.slice(0, 80)}" (Pat's is "${patSaw.slice(0, 80)}")`);
      return 'Sam has the same script, word for word';
    });

    await check('walk', 'both type at once; both keep their words and Pat keeps the caret', async ({ shot }) => {
      const [patBox, samBox] = await Promise.all([scriptBox(pat.page, win), scriptBox(sam.page, win)]);
      await patBox.click();
      await patBox.evaluate((el) => { const at = el.value.indexOf('old') - 1; el.setSelectionRange(at, at); });
      await samBox.click();
      await sam.page.keyboard.press('Control+End');
      await Promise.all([
        patBox.pressSequentially(PAT_INSERT, { delay: 60 }),
        samBox.pressSequentially(SAM_LINE, { delay: 15 }),
      ]);
      const want = `Made-up opening: welcome to the${PAT_INSERT} old mill tour.${SAM_LINE}`;
      const [patSaw, samSaw] = await bothSee(t, win, (s) => s === want);
      await sideBySide(t, 'both-typed-at-once', shot);
      if (patSaw !== samSaw) throw new Error(`the screens disagree: Pat "${patSaw}", Sam "${samSaw}"`);
      if (patSaw !== want) throw new Error(`the script reads "${patSaw}"`);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      if (!caret.endsWith(`the${PAT_INSERT}`)) throw new Error(`Pat's caret moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same, with Pat's and Sam's words whole; Pat's caret stayed after \"sunny\"";
    });

    await check('hunt', "Sam's change reaches Pat's pop-out reader", async () => {
      const until = Date.now() + 10_000;
      let seen = '';
      while (Date.now() < until && !seen.includes(SAM_LINE.trim())) {
        seen = await popOutText(pat.page);
        await pat.page.waitForTimeout(250);
      }
      if (!seen.includes(SAM_LINE.trim())) throw new Error(`Pat's pop-out still reads "${seen.slice(-60)}"`);
      return "Pat's pop-out holds Sam's closing line too";
    });

    await check('redteam', 'a script tag typed into the script shows as words and runs nowhere', async ({ shot }) => {
      const box = await scriptBox(pat.page, win);
      await box.click();
      await pat.page.keyboard.press('Control+End');
      await box.pressSequentially(TAG, { delay: 5 });
      await bothSee(t, win, (s) => s.includes('made-up tag line'));
      const frame = windowFrame(sam.page, win);
      const reading = frame.getByRole('button', { name: 'Read', exact: true });
      if (await reading.count()) await reading.click();
      await shot(sam.page, 'sam-reads-the-tag-as-words');
      const shown = await frame.innerText().catch(() => '');
      const problems = [];
      for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
        if (await page.evaluate(() => window.__madeUpPwned)) problems.push(`the script ran on ${who}'s screen`);
      }
      if (!shown.includes('<script>')) problems.push('Sam does not see the tag as words');
      if (problems.length) throw new Error(problems.join('; '));
      return 'Sam reads the tag as plain words; nothing ran on either screen';
    });
  },
};
