// Who typed what in a Vault note, for two people. Pat Example makes a note
// and types made-up words, then Sam Example adds a sentence on another
// screen. Sam presses "Who typed what": Pat's part and Sam's part are tinted
// in their colours, and a row of names says how many letters each wrote.
// Pat's screen says the same, and the note itself stays exactly as typed.
// Nothing is sent to a model, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const PAT_WORDS = 'Made-up Bakery opening plan.';
const SAM_WORDS = ' Bake the bread at six.';
const ALL = PAT_WORDS + SAM_WORDS;

const frame = (page, id) => windowFrame(page, id);
const box = (page, id) => frame(page, id).getByRole('textbox', { name: 'Note text' });
const names = (page, id) => frame(page, id).getByRole('list', { name: 'Who typed what' });

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// The words of the board's one made note, as this person's browser sees them.
async function noteWords(page, id) {
  const win = (await readWindow(page, id)) ?? {};
  const note = Array.isArray(win.notes) ? win.notes[0] : null;
  return note ? String(win[`vt.${note.id}`] ?? '') : '';
}

async function showWriters(page, id) {
  await frame(page, id).getByRole('button', { name: 'Who typed what', exact: true }).click({ timeout: 5_000 });
  await names(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'vaultWhoTyped',
  label: 'Vault notes: see who typed what in a note',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS, SAM_WORDS.trim());
    let win;

    await check('walk', 'Pat writes a made-up note, then Sam adds a sentence on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'vaultNotes', {}, { x: 40, y: 40 }, { w: 960, h: 620 });
      await frame(pat.page, win).getByRole('button', { name: 'New note' }).first().click({ timeout: 15_000 });
      await box(pat.page, win).click({ timeout: 15_000 });
      await box(pat.page, win).pressSequentially(PAT_WORDS, { delay: 8 });
      if (!(await waitFor(async () => (await noteWords(sam.page, win)) === PAT_WORDS, 15_000, sam.page))) throw new Error("Sam never got Pat's note");
      await box(sam.page, win).click({ timeout: 15_000 });
      await sam.page.keyboard.press('Control+End');
      await box(sam.page, win).pressSequentially(SAM_WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await noteWords(pat.page, win)) === ALL, 15_000, pat.page);
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await noteWords(pat.page, win)).slice(0, 60)}"`);
      return 'both screens have the same note';
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

    await check('walk', "Pat's screen says the same, and the note is unchanged", async ({ shot }) => {
      await showWriters(pat.page, win);
      const list = await names(pat.page, win).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      if ((await noteWords(pat.page, win)) !== ALL) throw new Error('the note changed');
      return 'Pat sees the same two names and parts; the note is unchanged';
    });
  },
};
