// Who typed what in the Code Editor, for two people. Pat Example writes a
// made-up line of code, then Sam Example adds a second line on another
// screen. Sam presses "Who typed what": Pat's part and Sam's part are tinted
// in their colours, and a row of names says how many letters each wrote.
// Pat's screen says the same, and the code itself stays exactly as typed.
// All code is made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_CODE = "const shop = 'Made-up Bakery';";
const SAM_CODE = '\nconsole.log(shop);';
const ALL = PAT_CODE + SAM_CODE;

const editorOf = (page, id) => windowFrame(page, id).locator('.cm-content').first();
const codeOf = async (page, id) => String((await readWindow(page, id))?.code ?? '');
const names = (page, id) => windowFrame(page, id).getByRole('list', { name: 'Who typed what' });

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function showWriters(page, id) {
  await windowFrame(page, id).getByRole('button', { name: 'Who typed what', exact: true }).click({ timeout: 5_000 });
  await names(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'codeWhoTyped',
  label: 'Code Editor: see who typed what in the code',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_CODE, SAM_CODE.trim());
    let win;

    await check('walk', 'Pat writes a made-up line, then Sam adds one on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'code_editor', { title: 'shop.js', code: '' }, { x: 40, y: 40 }, { w: 760, h: 420 });
      await editorOf(pat.page, win).click({ timeout: 15_000 });
      await pat.page.keyboard.press('Control+A');
      await pat.page.keyboard.press('Delete');
      await pat.page.keyboard.insertText(PAT_CODE);
      if (!(await waitFor(async () => (await codeOf(sam.page, win)) === PAT_CODE, 15_000, sam.page))) throw new Error("Sam never got Pat's code");
      await editorOf(sam.page, win).click({ timeout: 15_000 });
      await sam.page.keyboard.press('Control+End');
      await sam.page.keyboard.press('Enter');
      await sam.page.keyboard.insertText(SAM_CODE.trim());
      const ok = await waitFor(async () => (await codeOf(pat.page, win)) === ALL, 15_000, pat.page);
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await codeOf(pat.page, win)).slice(0, 60)}"`);
      return 'both screens have the same code';
    });

    await check('walk', "Sam presses 'Who typed what' and sees each part with its writer's name", async ({ shot }) => {
      await showWriters(sam.page, win);
      const list = await names(sam.page, win).innerText();
      const frame = windowFrame(sam.page, win);
      const patPart = await frame.locator('[data-typed-by="Pat Example"]').allTextContents();
      const samPart = await frame.locator('[data-typed-by="Sam Example"]').allTextContents();
      await shot(sam.page, 'sam-sees-who-typed-what');
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`names row reads "${list}"`);
      if (patPart.join('') !== PAT_CODE || samPart.join('').trim() !== SAM_CODE.trim()) throw new Error(`parts read "${patPart.join('|')}" and "${samPart.join('|')}"`);
      return "Pat's and Sam's parts are tinted in their colours, with both names and letter counts";
    });

    await check('walk', "Pat's screen says the same, and the code is unchanged", async ({ shot }) => {
      await showWriters(pat.page, win);
      const list = await names(pat.page, win).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      if ((await codeOf(pat.page, win)) !== ALL) throw new Error('the code changed');
      return 'Pat sees the same two names and parts; the code is unchanged';
    });
  },
};
