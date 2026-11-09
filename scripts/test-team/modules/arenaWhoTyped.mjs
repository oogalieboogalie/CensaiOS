// Who typed what in the Model Arena, for two people. Pat Example types a
// made-up request, then Sam Example adds to it and writes instructions on
// another screen. Sam presses "Who typed what": in the request Pat's part
// and Sam's part are tinted in their colours, with a row of names and
// letter counts, and the instructions show Sam's name. Pat's screen says the
// same, and the words stay exactly as typed. Nothing is raced, so no key is
// needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_ASK = 'Name three made-up towns.';
const SAM_ASK = ' One line each.';
const SAM_RULES = 'Keep it short.';
const ALL = PAT_ASK + SAM_ASK;
const REQ = 'Request to send to every model';
const SYS = 'Instructions for every model';

const frame = (page, id) => windowFrame(page, id);
const box = (page, id, label) => frame(page, id).getByRole('textbox', { name: label, exact: true });
const pane = (page, id, label) => frame(page, id).getByRole('region', { name: `Who typed the ${label}` });
const wordsOf = async (page, id) => {
  const win = (await readWindow(page, id)) || {};
  return { prompt: String(win.prompt ?? ''), system: String(win.system ?? '') };
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
  await pane(page, id, 'Request').getByRole('list', { name: 'Who typed what' }).waitFor({ timeout: 10_000 });
}

export default {
  id: 'arenaWhoTyped',
  label: 'Model Arena: see who typed what in the request and instructions',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_ASK, SAM_ASK.trim(), SAM_RULES);
    let win;

    await check('walk', 'Pat types a made-up request, then Sam adds to it and writes instructions on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'modelArena', {}, { x: 40, y: 40 }, { w: 1100, h: 640 });
      await box(pat.page, win, REQ).click({ timeout: 15_000 });
      await box(pat.page, win, REQ).pressSequentially(PAT_ASK, { delay: 8 });
      if (!(await waitFor(async () => (await wordsOf(sam.page, win)).prompt === PAT_ASK, 15_000, sam.page))) throw new Error("Sam never got Pat's request");
      await box(sam.page, win, REQ).click({ timeout: 15_000 });
      await sam.page.keyboard.press('Control+End');
      await box(sam.page, win, REQ).pressSequentially(SAM_ASK, { delay: 8 });
      await frame(sam.page, win).getByRole('button', { name: 'Add instructions' }).click();
      await box(sam.page, win, SYS).click();
      await box(sam.page, win, SYS).pressSequentially(SAM_RULES, { delay: 8 });
      const ok = await waitFor(async () => {
        const w = await wordsOf(pat.page, win);
        return w.prompt === ALL && w.system === SAM_RULES;
      }, 15_000, pat.page);
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await wordsOf(pat.page, win)).prompt.slice(0, 60)}"`);
      return 'both screens have the same request and instructions';
    });

    await check('walk', "Sam presses 'Who typed what' and sees each part with its writer's name", async ({ shot }) => {
      await showWriters(sam.page, win);
      const req = pane(sam.page, win, 'Request');
      const list = await req.getByRole('list', { name: 'Who typed what' }).innerText();
      const patPart = await req.locator('[data-typed-by="Pat Example"]').allTextContents();
      const samPart = await req.locator('[data-typed-by="Sam Example"]').allTextContents();
      const rules = await pane(sam.page, win, 'Instructions').getByRole('list', { name: 'Who typed what' }).innerText();
      await shot(sam.page, 'sam-sees-who-typed-what');
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`names row reads "${list}"`);
      if (patPart.join('') !== PAT_ASK || samPart.join('') !== SAM_ASK) throw new Error(`parts read "${patPart.join('|')}" and "${samPart.join('|')}"`);
      if (!rules.includes('Sam Example') || rules.includes('Pat Example')) throw new Error(`instructions names read "${rules}"`);
      return "Pat's and Sam's parts of the request are tinted in their colours; the instructions show Sam's name";
    });

    await check('walk', "Pat's screen says the same, and the words are unchanged", async ({ shot }) => {
      await showWriters(pat.page, win);
      const list = await pane(pat.page, win, 'Request').getByRole('list', { name: 'Who typed what' }).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      const w = await wordsOf(pat.page, win);
      if (w.prompt !== ALL || w.system !== SAM_RULES) throw new Error('the words changed');
      return 'Pat sees the same two names and parts; the words are unchanged';
    });
  },
};
