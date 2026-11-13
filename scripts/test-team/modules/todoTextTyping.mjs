// To-do list typing for two people. Pat Example adds a made-up to-do and Sam
// Example sees it. Then both open that to-do and, at the same moment, Pat
// types at the start of its words while Sam types at the end: both people's
// words must be whole on both screens (before, a to-do's words were saved
// whole and only on Enter, so the last one to save wiped out the other's
// letters), the list must still hold one to-do, and Pat's cursor must stay
// right after Pat's own words. Nothing is handed off, so no key is needed.
// All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const textsOf = async (page, id) => ((await readWindow(page, id))?.items ?? []).map((it) => it.text);

async function bothSee(t, id, want, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => textsOf(p.page, id)));
    if (seen.every((s) => JSON.stringify(s) === JSON.stringify(want)) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const wordsBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'To-do words' });

export default {
  id: 'todoTextTyping',
  label: 'To-do list: two people type in one to-do at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Order rye flour ${run}`, pat: 'Today: ', sam: ', two bags' };
    t.typed.push(...Object.values(W).map((w) => w.replace(/[:,]/g, '').trim()));
    let win;

    await check('walk', 'Pat adds a made-up to-do and Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'todos', {}, { x: 40, y: 40 }, { w: 520, h: 420 });
      const add = windowFrame(pat.page, win).getByPlaceholder('add a to-do');
      await add.click({ timeout: 15_000 });
      await add.pressSequentially(W.start, { delay: 10 });
      await add.press('Enter');
      const [, samSaw] = await bothSee(t, win, [W.start]);
      await windowFrame(sam.page, win).getByText(W.start).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'sam-sees-the-todo');
      if (JSON.stringify(samSaw) !== JSON.stringify([W.start])) throw new Error(`Sam's to-dos read ${JSON.stringify(samSaw)}`);
      return 'Sam has the same to-do, letter for letter';
    });

    await check('walk', 'Pat and Sam type in one to-do at once; both keep their words', async ({ shot }) => {
      for (const p of [pat, sam]) await windowFrame(p.page, win).getByText(W.start).dblclick();
      const [patBox, samBox] = [wordsBox(pat.page, win), wordsBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = [`${W.pat}${W.start}${W.sam}`];
      const seen = await bothSee(t, win, want);
      await sideBySide(t, 'both-typed-at-once', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((s) => JSON.stringify(s) !== JSON.stringify(want));
      if (bad !== undefined) throw new Error(`a screen's to-dos read ${JSON.stringify(bad)}`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens hold one to-do with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });

    await check('walk', 'Pat and Sam both press Enter; the words stay whole', async ({ shot }) => {
      await wordsBox(pat.page, win).press('Enter');
      await wordsBox(sam.page, win).press('Enter');
      const want = [`${W.pat}${W.start}${W.sam}`];
      const seen = await bothSee(t, win, want);
      await windowFrame(sam.page, win).getByText(want[0]).waitFor({ timeout: 10_000 });
      await shot(sam.page, 'after-enter');
      const bad = seen.find((s) => JSON.stringify(s) !== JSON.stringify(want));
      if (bad !== undefined) throw new Error(`a screen's to-dos read ${JSON.stringify(bad)}`);
      return 'after both finish, both screens still show the merged words';
    });
  },
};
