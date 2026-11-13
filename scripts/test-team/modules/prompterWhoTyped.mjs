// Who typed what in a Teleprompter script, for two people. Pat Example
// writes made-up words, then Sam Example adds more on another screen. Sam
// presses "Who typed what": Pat's part and Sam's part are tinted in their
// colours, and a row of names says how many letters each wrote. Pat's screen
// says the same, and the script itself stays exactly as typed. All words are
// made up.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_WORDS = 'Welcome to the made-up bakery tour.';
const SAM_WORDS = ' Mind the flour on the floor.';
const ALL = PAT_WORDS + SAM_WORDS;

const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Script' });
const textOf = (page, id) => page.evaluate((wid) => String(window.__e2eStore.getState().wins.find((w) => w.id === wid)?.text ?? ''), id);
const names = (page, id) => windowFrame(page, id).getByRole('list', { name: 'Who typed what' });

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function openScript(page, id) {
  if (!(await box(page, id).count())) await windowFrame(page, id).getByRole('button', { name: 'Edit script', exact: true }).click();
  await box(page, id).waitFor({ timeout: 10_000 });
  return box(page, id);
}

async function showWriters(page, id) {
  await windowFrame(page, id).getByRole('button', { name: 'Who typed what', exact: true }).click({ timeout: 5_000 });
  await names(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'prompterWhoTyped',
  label: 'Teleprompter: see who typed what in the script',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS, SAM_WORDS.trim());
    let win;

    await check('walk', 'Pat writes made-up words, then Sam adds more on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'teleprompter', { text: '' }, { x: 60, y: 60 }, { w: 640, h: 420 });
      const patBox = await openScript(pat.page, win);
      await patBox.click();
      await patBox.pressSequentially(PAT_WORDS, { delay: 8 });
      if (!(await waitFor(async () => (await textOf(sam.page, win)) === PAT_WORDS, 15_000, sam.page))) throw new Error("Sam never got Pat's words");
      const samBox = await openScript(sam.page, win);
      await samBox.evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, PAT_WORDS.length);
      await samBox.pressSequentially(SAM_WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(pat.page, win)) === ALL, 15_000, pat.page);
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await textOf(pat.page, win)).slice(0, 60)}"`);
      return 'both screens read the same script';
    });

    await check('walk', "Sam presses 'Who typed what' and sees each part with its writer's name", async ({ shot }) => {
      await showWriters(sam.page, win);
      const list = await names(sam.page, win).innerText();
      const frame = windowFrame(sam.page, win);
      const patPart = await frame.locator('[data-typed-by="Pat Example"]').allInnerTexts();
      const samPart = await frame.locator('[data-typed-by="Sam Example"]').allInnerTexts();
      await shot(sam.page, 'sam-sees-who-typed-what');
      if (!list.includes(`Pat Example · ${PAT_WORDS.length} letters`)) throw new Error(`names row reads "${list}"`);
      if (!list.includes(`Sam Example · ${SAM_WORDS.length} letters`)) throw new Error(`names row reads "${list}"`);
      if (patPart.join('') !== PAT_WORDS || samPart.join('').trim() !== SAM_WORDS.trim()) throw new Error(`parts read "${patPart.join('|')}" and "${samPart.join('|')}"`);
      return `Pat's and Sam's parts are tinted in their colours, with both names and letter counts`;
    });

    await check('walk', "Pat's screen says the same", async ({ shot }) => {
      if (await box(pat.page, win).count()) await box(pat.page, win).evaluate((el) => el.blur());
      await showWriters(pat.page, win);
      const list = await names(pat.page, win).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      if ((await textOf(pat.page, win)) !== ALL) throw new Error('the script changed');
      return 'Pat sees the same two names and parts; the script is unchanged';
    });
  },
};
