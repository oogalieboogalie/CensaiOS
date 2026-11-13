// Writer tables for two people. Pat Example adds a table to a made-up price
// list and fills in a cell; Sam Example sees it. Then, at the same moment,
// Pat types at the start of that cell while Sam types at its end, and Sam
// fills in another cell: every word must be whole on both screens (before,
// the whole table was saved as one piece, so the last one to type replaced
// the other's), and Pat's cursor must stay right after Pat's own words.
// Nothing is downloaded or put online. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

/** The first table's rows as this person's board holds them. */
async function tableOf(page, id) {
  const win = (await readWindow(page, id)) || {};
  const key = Object.keys(win).find((k) => k.startsWith('ob.') && win[k]?.type === 'table');
  return key ? win[key].rows : null;
}

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => tableOf(p.page, id)));
    if (seen.every((rows) => rows && test(rows)) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

const cell = (page, id, r, c) => windowFrame(page, id).getByLabel(`Row ${r} column ${c}`, { exact: true });

export default {
  id: 'writerTableTyping',
  label: 'Writer: two people type in one table at once',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Rye bread ${run}`, pat: 'Fresh ', sam: ' loaf', price: '4.50' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat adds a table and fills in a cell; Sam sees it', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'officeDocs', { title: 'Made-up price list' }, { x: 40, y: 40 }, { w: 820, h: 560 });
      await windowFrame(pat.page, win).getByRole('button', { name: 'Table' }).click({ timeout: 15_000 });
      await cell(pat.page, win, 2, 1).fill(W.start, { timeout: 15_000 });
      const [, samSaw] = await bothSee(t, win, (rows) => rows[1]?.[0] === W.start);
      await cell(sam.page, win, 2, 1).waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-table');
      if (samSaw?.[1]?.[0] !== W.start) throw new Error(`Sam's cell reads "${samSaw?.[1]?.[0] ?? ''}"`);
      return 'Sam has the same table, cell for cell';
    });

    await check('walk', 'Pat and Sam type in one table at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [cell(pat.page, win, 2, 1), cell(sam.page, win, 2, 1)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      await cell(sam.page, win, 2, 2).fill(W.price);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, (rows) => rows[1]?.[0] === want && rows[1]?.[1] === W.price);
      await sideBySide(t, 'both-typed-in-one-table', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((rows) => rows?.[1]?.[0] !== want || rows?.[1]?.[1] !== W.price);
      if (bad) throw new Error(`a screen's row reads "${bad?.[1]?.join(' | ') ?? ''}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read one table with Pat's and Sam's words whole; Pat's cursor stayed after Pat's words";
    });
  },
};
