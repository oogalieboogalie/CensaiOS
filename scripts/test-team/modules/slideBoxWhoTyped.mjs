// Who typed what in a slide's text box, for two people. Pat Example opens a
// made-up deck whose body box is empty and types a line into it, then Sam
// Example adds a sentence to the same box on another screen. Sam picks the
// box and presses "Who typed what": Pat's part and Sam's part are tinted in
// their colours, with a row of names and letter counts. Pat's screen says
// the same, and the words stay exactly as typed. Nothing is sent to a model,
// so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const TITLE = 'Made-up cover';
const PAT_WORDS = 'Fresh bread every morning.';
const SAM_WORDS = ' Made-up rolls on Sunday.';
const ALL = PAT_WORDS + SAM_WORDS;
const block = (id, text, y) => ({ id, type: 'text', x: 6, y, w: 88, h: 30, text });
const DECK = {
  title: 'Made-up pitch',
  officeDeck: { order: ['s1'], theme: 'censai' },
  'os.s1': { layout: 'titleBody', blocks: [block('t1', TITLE, 7), block('b1', '', 45)], notes: '', at: 1 },
};

const frame = (page, id) => windowFrame(page, id);
const boxes = (page, id) => frame(page, id).locator('.hb-of-stage .hb-of-sblock[data-type="text"]');
const typing = (page, id) => frame(page, id).getByRole('textbox', { name: 'Slide text' });
const pane = (page, id) => frame(page, id).getByTestId('slide-box-who-typed');
const names = (page, id) => pane(page, id).getByRole('list', { name: 'Who typed what' });

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// The words of the body box, as this person's browser sees them.
async function bodyOf(page, id) {
  const win = (await readWindow(page, id)) || {};
  return String(win['os.s1']?.blocks?.[1]?.text ?? '');
}

async function showWriters(page, id) {
  await boxes(page, id).nth(1).click({ timeout: 10_000 });
  await frame(page, id).getByRole('button', { name: 'Who typed this box', exact: true }).click({ timeout: 5_000 });
  await names(page, id).waitFor({ timeout: 10_000 });
}

export default {
  id: 'slideBoxWhoTyped',
  label: "Slides: see who typed what in a slide's text box",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(PAT_WORDS, SAM_WORDS.trim());
    let win;

    await check('walk', 'Pat types a made-up line into the body box, then Sam adds a sentence on another screen', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeSlides', DECK, { x: 40, y: 40 }, { w: 980, h: 640 });
      await boxes(pat.page, win).nth(1).dblclick({ timeout: 15_000 });
      await typing(pat.page, win).pressSequentially(PAT_WORDS, { delay: 8 });
      await typing(pat.page, win).press('Escape');
      if (!(await waitFor(async () => (await bodyOf(sam.page, win)) === PAT_WORDS, 15_000, sam.page))) throw new Error("Sam never got Pat's line");
      await boxes(sam.page, win).nth(1).dblclick({ timeout: 15_000 });
      await typing(sam.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await typing(sam.page, win).pressSequentially(SAM_WORDS, { delay: 8 });
      await typing(sam.page, win).press('Escape');
      const ok = await waitFor(async () => (await bodyOf(pat.page, win)) === ALL, 15_000, pat.page);
      await sideBySide(t, 'both-wrote', shot);
      if (!ok) throw new Error(`Pat's copy reads "${(await bodyOf(pat.page, win)).slice(0, 60)}"`);
      return 'both screens have the same words in the box';
    });

    await check('walk', "Sam picks the box, presses 'Who typed what' and sees each part with its writer's name", async ({ shot }) => {
      await showWriters(sam.page, win);
      const list = await names(sam.page, win).innerText();
      const patPart = await pane(sam.page, win).locator('[data-typed-by="Pat Example"]').allTextContents();
      const samPart = await pane(sam.page, win).locator('[data-typed-by="Sam Example"]').allTextContents();
      await shot(sam.page, 'sam-sees-who-typed-what');
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`names row reads "${list}"`);
      if (patPart.join('') !== PAT_WORDS || samPart.join('') !== SAM_WORDS) throw new Error(`parts read "${patPart.join('|')}" and "${samPart.join('|')}"`);
      return "Pat's and Sam's parts are tinted in their colours, with both names and letter counts";
    });

    await check('walk', "Pat's screen says the same, and the words are unchanged", async ({ shot }) => {
      await showWriters(pat.page, win);
      const list = await names(pat.page, win).innerText();
      await sideBySide(t, 'both-see-who-typed-what', shot);
      if (!list.includes('Pat Example') || !list.includes('Sam Example')) throw new Error(`Pat's names row reads "${list}"`);
      if ((await bodyOf(pat.page, win)) !== ALL) throw new Error('the words changed');
      return 'Pat sees the same two names and parts; the words are unchanged';
    });
  },
};
