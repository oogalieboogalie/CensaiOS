// Live cursors in the Code Editor for two people. Pat Example opens a
// made-up script and Sam Example sees it. Sam puts the cursor right after
// "const shop". Pat must see a line with Sam's name there, and when Pat
// types a note at the top the line must move with Sam's code. Sam sees
// Pat's cursor too. When Sam clicks away, Sam's line leaves Pat's screen.
// Nothing is written by the AI, so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const CODE = 'const shop = "Sam Example Bakery";\nconsole.log(shop);\n';
const SPOT = 'const shop'.length;
const NOTE = '// Pat ';

const editorOf = (page, id) => windowFrame(page, id).locator('.cm-content').first();
const markOf = (page, id, name) => windowFrame(page, id).locator(`[data-teammate-caret="${name}"]`);
const codeOf = async (page, id) => String((await readWindow(page, id))?.code ?? '');
const markAt = async (page, id, name) => {
  const m = markOf(page, id, name);
  return (await m.count()) ? m.first().getAttribute('data-at') : null;
};

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// Click into the code, go to the very start, then step right `steps` letters.
async function caretTo(page, id, steps) {
  const editor = editorOf(page, id);
  await editor.click({ timeout: 15_000 });
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < steps; i += 1) await page.keyboard.press('ArrowRight');
}

export default {
  id: 'codeCursors',
  label: "Code Editor: see a teammate's cursor in the code",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(NOTE.trim());
    let win;

    await check('walk', 'Pat opens a made-up script and Sam sees the same code', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'code_editor', { title: 'shop.js', code: CODE }, { x: 40, y: 40 }, { w: 760, h: 420 });
      const same = await waitFor(async () => ((await codeOf(sam.page, win)) === CODE ? 'ok' : null), 15_000, pat.page);
      await editorOf(sam.page, win).waitFor({ timeout: 15_000 });
      await shot(sam.page, 'sam-sees-the-code');
      if (!same) throw new Error('Sam does not have the same code');
      return 'Sam has the same code';
    });

    await check('walk', 'Sam puts the cursor after "const shop"; Pat sees Sam\'s name there', async ({ shot }) => {
      await caretTo(sam.page, win, SPOT);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!ok) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      return 'Pat sees a line with Sam\'s name right after "const shop"';
    });

    await check('walk', "Pat types a note at the top; Sam's cursor moves with the code, and Sam sees Pat's", async ({ shot }) => {
      await caretTo(pat.page, win, 0);
      await pat.page.keyboard.type(NOTE, { delay: 40 });
      const want = String(SPOT + NOTE.length);
      const moved = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      const seen = await waitFor(async () => ((await markAt(sam.page, win, 'Pat Example')) === String(NOTE.length) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-code', shot);
      if (!moved) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      if (!seen) throw new Error(`Sam sees Pat's cursor at ${(await markAt(sam.page, win, 'Pat Example')) ?? 'nowhere'}, not ${NOTE.length}`);
      if (!(await codeOf(sam.page, win)).startsWith(NOTE)) throw new Error("Pat's note did not reach Sam");
      return `Sam's line moved to letter ${want} with the code, and Sam sees Pat's line after the note`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await editorOf(sam.page, win).evaluate(() => document.activeElement?.blur());
      const gone = await waitFor(async () => (await markOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
