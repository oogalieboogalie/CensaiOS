// Live cursors in Legion for two people. Pat Example types a made-up goal
// and Sam Example sees it. Sam puts the cursor after "A made-up"; Pat must
// see a line with Sam's name at that spot, and when Pat types in front of it
// the line must move with Sam's words. Then Sam moves into the YAML spec:
// Sam's line leaves the goal and shows in the spec. When Sam clicks away, it
// leaves Pat's screen. Nothing is started, so no key is needed. All words
// are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const GOAL = 'A made-up page for Pat Example Bakery with a menu.';
const SPEC = 'goal: A made-up page';
const SPOT = 'A made-up'.length;
const PAT_WORDS = 'Build ';
const GOAL_BOX = 'What should the Legion build?';
const SPEC_BOX = 'YAML spec';

const box = (page, id, label) => windowFrame(page, id).getByRole('textbox', { name: label });
const markOf = (page, id, label, name) => box(page, id, label).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const fieldOf = async (page, id, key) => (await readWindow(page, id))?.[key] ?? '';

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const markAt = async (page, id, label, name) => {
  const m = markOf(page, id, label, name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'legionCursors',
  label: "Legion: see a teammate's cursor in the goal and the YAML spec",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(GOAL, SPEC, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up goal and spec, and Sam sees them', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'legion', {}, { x: 40, y: 40 }, { w: 1100, h: 640 });
      await box(pat.page, win, GOAL_BOX).click({ timeout: 15_000 });
      await box(pat.page, win, GOAL_BOX).pressSequentially(GOAL, { delay: 8 });
      await windowFrame(pat.page, win).getByRole('checkbox', { name: 'Use my own YAML spec' }).check();
      await box(pat.page, win, SPEC_BOX).click();
      await box(pat.page, win, SPEC_BOX).pressSequentially(SPEC, { delay: 8 });
      const ok = await waitFor(async () => (await fieldOf(sam.page, win, 'legionGoal')) === GOAL
        && (await fieldOf(sam.page, win, 'legionSpecYaml')) === SPEC, 15_000, pat.page);
      await box(sam.page, win, SPEC_BOX).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-goal');
      if (!ok) throw new Error(`Sam's goal reads "${(await fieldOf(sam.page, win, 'legionGoal')).slice(0, 60)}"`);
      return 'Sam has the same goal and spec';
    });

    await check('walk', "Sam puts the cursor after 'A made-up'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win, GOAL_BOX).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win, GOAL_BOX).press('End');
      await box(sam.page, win, GOAL_BOX).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win, GOAL_BOX).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, GOAL_BOX, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, GOAL_BOX, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(sam.page, win, GOAL_BOX, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"A made-up\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win, GOAL_BOX);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, GOAL_BOX, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, GOAL_BOX, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "A made-up" (now letter ${want})`;
    });

    await check('walk', "Sam moves to the spec; Sam's line moves boxes on Pat's screen", async ({ shot }) => {
      await box(sam.page, win, SPEC_BOX).evaluate((el) => { el.focus(); el.setSelectionRange(4, 4); });
      await box(sam.page, win, SPEC_BOX).press('Shift');
      const ok = await waitFor(async () => ((await markAt(pat.page, win, SPEC_BOX, 'Sam Example')) === '4'
        && !(await markOf(pat.page, win, GOAL_BOX, 'Sam Example').count()) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'sams-cursor-in-the-spec', shot);
      if (!ok) throw new Error("Sam's line did not move to the spec on Pat's screen");
      return "Sam's line left the goal and sits after \"goal\" in the spec";
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win, SPEC_BOX).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, SPEC_BOX, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
