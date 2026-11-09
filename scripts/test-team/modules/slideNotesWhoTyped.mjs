// Who typed what in Slides speaker notes, for two people. Pat Example makes
// a slide and types made-up notes, then Sam Example adds a sentence on
// another screen. Sam presses "Who typed what": Pat's part and Sam's part are
// tinted in their colours, and a row of names says how many letters each
// wrote. Pat's screen says the same, and the notes stay exactly as typed.
// Nothing is sent to a model, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_WORDS = 'Open with the made-up demo.';
const SAM_WORDS = ' Thank the bakery team.';
const ALL = PAT_WORDS + SAM_WORDS;

const frame = (page, id) => windowFrame(page, id);
const box = (page, id) => frame(page, id).getByRole('textbox', { name: 'Speaker notes', exact: true });
const names = (page, id) => frame(page, id).getByRole('list', { name: 'Who typed what' });

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// The speaker notes of the deck's one slide, as this person's browser sees them.
async function notesOf(page, id) {
  const win = (await readWindow(page, id)) || {};
  const key = Object.keys(win).find((k) => k.startsWith('os.') && win[k]);
  return key ? String(win[key].notes ?? '') : '';
}

async function showWriters(page, id) {
  await frame(page, id).getByRole('button', { name: 'Who typed what', exact: true }).click({ timeout: 5_000 });
  await names(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'slideNotesWhoTyped',
  label: 'Slides: see who typed what in the speaker notes',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS, SAM_WORDS.trim());
    let win;

    await check('walk', 'Pat types made-up speaker notes, then Sam adds a sentence on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeSlides', { title: 'Made-up pitch' }, { x: 40, y: 40 }, { w: 960, h: 600 });
      await frame(pat.page, win).getByRole('button', { name: 'Add your first slide' }).click({ timeout: 15_000 });
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(PAT_WORDS, { delay: 8 });
      if (!(await waitFor(async () => (await notesOf(sam.page, win)) === PAT_WORDS, 15_000, sam.page))) throw new Error("Sam never got Pat's notes");
      await box(sam.page, win).click({ timeout: 15_000 });
      await sam.page.keyboard.press('Control+End');
      await box(sam.page, win).pressSequentially(SAM_WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await notesOf(pat.page, win)) === ALL, 15_000, pat.page);
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await notesOf(pat.page, win)).slice(0, 60)}"`);
      return 'both screens have the same speaker notes';
    });

    await check('walk', "Sam presses 'Who typed what' and sees each part with its writer's name", async ({ shot }) => {
      await showWriters(sam.page, win);
      const list = await names(sam.page, win).innerText();
      const patPart = await frame(sam.page, win).locator('[data-typed-by="Pat Example"]').allTextContents();
      const samPart = await frame(sam.page, win).locator('[data-typed-by="Sam Example"]').allTextContents();
      await shot(sam.page, 'sam-sees-who-typed-what');
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`names row reads "${list}"`);
      if (patPart.join('') !== PAT_WORDS || samPart.join('') !== SAM_WORDS) throw new Error(`parts read "${patPart.join('|')}" and "${samPart.join('|')}"`);
      return "Pat's and Sam's parts are tinted in their colours, with both names and letter counts";
    });

    await check('walk', "Pat's screen says the same, and the notes are unchanged", async ({ shot }) => {
      await showWriters(pat.page, win);
      const list = await names(pat.page, win).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      if ((await notesOf(pat.page, win)) !== ALL) throw new Error('the notes changed');
      return 'Pat sees the same two names and parts; the notes are unchanged';
    });
  },
};
