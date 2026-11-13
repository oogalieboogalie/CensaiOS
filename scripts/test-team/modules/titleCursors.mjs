// Live cursors in window names for two people. Pat Example names a made-up
// Writer document and Sam Example sees it. Sam puts the cursor after
// "Spring bake"; Pat must see a line with Sam's name at that spot, and when
// Pat types in front of it the line must move with Sam's words. When Sam
// clicks away, it leaves Pat's screen. Then the same in a Workflow's name.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const NAME = 'Spring bake sale plan';
const SPOT = 'Spring bake'.length;
const PAT_WORDS = 'Big ';

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

const KINDS = [
  { kind: 'officeDocs', what: 'Writer title', label: 'Document title', start: { title: '' }, size: { w: 820, h: 560 } },
  { kind: 'workflow', what: 'Workflow name', label: 'Workflow name', start: {}, size: { w: 900, h: 600 }, rename: true },
];

export default {
  id: 'titleCursors',
  label: "Window names: see a teammate's cursor in the Writer title and Workflow name",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(NAME, PAT_WORDS.trim());

    for (const k of KINDS) {
      const slug = k.kind === 'workflow' ? 'workflow' : 'writer';
      const box = (page, id) => windowFrame(page, id).getByRole('textbox', { name: k.label, exact: true });
      const markOf = (page, id, name) => box(page, id).locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
      const markAt = async (page, id, name) => {
        const m = markOf(page, id, name);
        return (await m.count()) ? m.getAttribute('data-at') : null;
      };
      const openBox = async (page, id) => {
        if (k.rename && !(await box(page, id).count())) await windowFrame(page, id).getByRole('button', { name: 'Rename' }).click({ timeout: 15_000 });
        await box(page, id).waitFor({ timeout: 15_000 });
      };
      let win;

      await check('walk', `Pat types a made-up ${k.what}, and Sam sees it`, async ({ shot }) => {
        win = await spawnWindow(pat.page, k.kind, k.start, { x: 40, y: 40 }, k.size);
        await openBox(pat.page, win);
        // An empty Workflow name shows "Workflow", so type over whatever is there.
        await box(pat.page, win).click();
        await box(pat.page, win).press('ControlOrMeta+a');
        await box(pat.page, win).pressSequentially(NAME, { delay: 8 });
        const ok = await waitFor(async () => ((await readWindow(sam.page, win)) ?? {}).title === NAME, 15_000, pat.page);
        await openBox(sam.page, win);
        await shot(sam.page, `${slug}-sam-sees-the-name`);
        if (!ok) throw new Error(`Sam's copy of the ${k.what} does not match`);
        return `Sam has the same ${k.what}`;
      });

      await check('walk', `Sam puts the cursor after 'Spring bake'; Pat sees Sam's name there (${k.what})`, async ({ shot }) => {
        await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
        await box(pat.page, win).press('End');
        await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
        await box(sam.page, win).press('Shift');
        const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
        await pat.page.waitForTimeout(500);
        await sideBySide(t, `${slug}-pat-sees-sams-cursor`, shot);
        if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
        if (!(await markOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
        return "Pat sees a line with Sam's name right after \"Spring bake\", and Sam sees Pat's";
      });

      await check('walk', `Pat types in front; Sam's cursor moves with Sam's words (${k.what})`, async ({ shot }) => {
        const patBox = box(pat.page, win);
        await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
        await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
        const want = String(SPOT + PAT_WORDS.length);
        const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
        await pat.page.waitForTimeout(500);
        await sideBySide(t, `${slug}-cursor-moves-with-the-words`, shot);
        if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
        return `Sam's line still sits after "Spring bake" (now letter ${want})`;
      });

      await check('walk', `Sam clicks away; Sam's cursor leaves Pat's screen (${k.what})`, async ({ shot }) => {
        await box(sam.page, win).evaluate((el) => el.blur());
        await box(pat.page, win).evaluate((el) => el.blur());
        const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
        await shot(pat.page, `${slug}-sams-cursor-gone`);
        if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
        return "Sam's line is gone from Pat's screen";
      });
    }
  },
};
