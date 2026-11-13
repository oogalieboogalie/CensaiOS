// Who typed what in Legion, for two people. Pat Example types a made-up
// goal, then Sam Example adds to it and writes a YAML spec on another
// screen. Sam presses "Who typed what": in the goal Pat's part and Sam's
// part are tinted in their colours, with a row of names and letter counts,
// and the spec shows Sam's name. Pat's screen says the same, and the words
// stay exactly as typed. Nothing is started, so no key is needed. All words
// are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_GOAL = 'A made-up page for Pat Example Bakery.';
const SAM_GOAL = ' With a menu.';
const SAM_SPEC = 'goal: A made-up page';
const ALL = PAT_GOAL + SAM_GOAL;
const GOAL_BOX = 'What should the Legion build?';
const SPEC_BOX = 'YAML spec';

const frame = (page, id) => windowFrame(page, id);
const box = (page, id, label) => frame(page, id).getByRole('textbox', { name: label, exact: true });
const pane = (page, id, label) => frame(page, id).getByRole('region', { name: `Who typed the ${label}` });
const wordsOf = async (page, id) => {
  const win = (await readWindow(page, id)) || {};
  return { goal: String(win.legionGoal ?? ''), spec: String(win.legionSpecYaml ?? '') };
};

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function showWriters(page, id) {
  await frame(page, id).getByRole('button', { name: 'Who typed what', exact: true }).click({ timeout: 5_000 });
  await pane(page, id, 'Goal').getByRole('list', { name: 'Who typed what' }).waitFor({ timeout: 10_000 });
}

export default {
  id: 'legionWhoTyped',
  label: 'Legion: see who typed what in the goal and the YAML spec',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_GOAL, SAM_GOAL.trim(), SAM_SPEC);
    let win;

    await check('walk', 'Pat types a made-up goal, then Sam adds to it and writes a YAML spec on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'legion', {}, { x: 40, y: 40 }, { w: 1100, h: 640 });
      await box(pat.page, win, GOAL_BOX).click({ timeout: 15_000 });
      await box(pat.page, win, GOAL_BOX).pressSequentially(PAT_GOAL, { delay: 8 });
      if (!(await waitFor(async () => (await wordsOf(sam.page, win)).goal === PAT_GOAL, 15_000, sam.page))) throw new Error("Sam never got Pat's goal");
      await box(sam.page, win, GOAL_BOX).click({ timeout: 15_000 });
      await sam.page.keyboard.press('Control+End');
      await box(sam.page, win, GOAL_BOX).pressSequentially(SAM_GOAL, { delay: 8 });
      await frame(sam.page, win).getByRole('checkbox', { name: 'Use my own YAML spec' }).check();
      await box(sam.page, win, SPEC_BOX).click();
      await box(sam.page, win, SPEC_BOX).pressSequentially(SAM_SPEC, { delay: 8 });
      const ok = await waitFor(async () => {
        const w = await wordsOf(pat.page, win);
        return w.goal === ALL && w.spec === SAM_SPEC;
      }, 15_000, pat.page);
      await box(pat.page, win, SPEC_BOX).waitFor({ timeout: 15_000 });
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await wordsOf(pat.page, win)).goal.slice(0, 60)}"`);
      return 'both screens have the same goal and spec';
    });

    await check('walk', "Sam presses 'Who typed what' and sees each part with its writer's name", async ({ shot }) => {
      await showWriters(sam.page, win);
      const goal = pane(sam.page, win, 'Goal');
      const list = await goal.getByRole('list', { name: 'Who typed what' }).innerText();
      const patPart = await goal.locator('[data-typed-by="Pat Example"]').allTextContents();
      const samPart = await goal.locator('[data-typed-by="Sam Example"]').allTextContents();
      const spec = await pane(sam.page, win, 'YAML spec').getByRole('list', { name: 'Who typed what' }).innerText();
      await shot(sam.page, 'sam-sees-who-typed-what');
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`names row reads "${list}"`);
      if (patPart.join('') !== PAT_GOAL || samPart.join('') !== SAM_GOAL) throw new Error(`parts read "${patPart.join('|')}" and "${samPart.join('|')}"`);
      if (!spec.includes('Sam Example') || spec.includes('Pat Example')) throw new Error(`spec names read "${spec}"`);
      return "Pat's and Sam's parts of the goal are tinted in their colours; the spec shows Sam's name";
    });

    await check('walk', "Pat's screen says the same, and the words are unchanged", async ({ shot }) => {
      await showWriters(pat.page, win);
      const list = await pane(pat.page, win, 'Goal').getByRole('list', { name: 'Who typed what' }).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      const w = await wordsOf(pat.page, win);
      if (w.goal !== ALL || w.spec !== SAM_SPEC) throw new Error('the words changed');
      return 'Pat sees the same two names and parts; the words are unchanged';
    });
  },
};
