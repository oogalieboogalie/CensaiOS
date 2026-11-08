// Live cursors in a text box on a YorWare PDF page for two people. Pat
// Example types made-up words into a box on a made-up PDF; Sam Example
// double-clicks the same box and puts the cursor after "Signed by". Pat must
// see a line with Sam's name at that spot, and when Pat types in front of it
// the line must move with Sam's words. When Pat stops typing, the box shows
// Sam's name tag instead; when Sam clicks away, it leaves Pat's screen.
// Nothing is written by the AI, so no key is needed. All words are made up.

import * as PdfLib from 'pdf-lib';
import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const MID = 'crewM1';
const WORDS = 'Signed by Sam Example';
const SPOT = 'Signed by'.length;
const PAT_WORDS = 'OK: ';

const textBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Text on the page' });
const markEl = (page, id) => windowFrame(page, id).locator(`[data-mark="${MID}"]`);
const tagOf = (page, id, name) => markEl(page, id).locator(`[data-teammate-caret="${name}"]`);
const textOf = async (page, id) => String((await readWindow(page, id))?.[`pm.${MID}`]?.text ?? '');

async function madeUpPdf() {
  const pdf = await PdfLib.PDFDocument.create();
  pdf.addPage([612, 792]).drawText('Made-up lease for Pat Example', { x: 60, y: 720, size: 18 });
  return Buffer.from(await pdf.save()).toString('base64');
}

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

// Double-clicking a text box on the page opens it for typing.
async function open(page, id) {
  if (await textBox(page, id).count()) return;
  await markEl(page, id).dblclick({ timeout: 15_000 });
  await textBox(page, id).waitFor({ timeout: 10_000 });
}

const tagAt = async (page, id, name) => {
  const m = tagOf(page, id, name);
  return (await m.count()) ? m.first().getAttribute('data-at') : null;
};

export default {
  id: 'pdfCursors',
  label: "YorWare PDF: see a teammate's cursor in a text box on a page",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', 'Pat types words on a made-up PDF, and Sam opens the same text box', async ({ shot }) => {
      const data = await madeUpPdf();
      win = await spawnWindow(pat.page, 'yorPdf', {
        title: 'Made-up lease',
        pdfDoc: { order: ['crewP1'] },
        'pf.crewF1': { name: 'made-up-lease.pdf', data, bytes: data.length, at: 1 },
        'pp.crewP1': { file: 'crewF1', index: 0, w: 612, h: 792, rot: 0, at: 1 },
        [`pm.${MID}`]: { page: 'crewP1', type: 'text', text: '', size: 18, x: 60, y: 200, w: 40, h: 26, at: 1 },
      }, { x: 40, y: 40 }, { w: 1000, h: 760 });
      await open(pat.page, win);
      await textBox(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await textOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await open(sam.page, win);
      await shot(sam.page, 'sam-sees-the-words');
      if (!ok) throw new Error("Sam's copy of the words does not match");
      return 'Sam has the same text box open';
    });

    await check('walk', "Sam puts the cursor after 'Signed by'; Pat sees Sam's name there", async ({ shot }) => {
      await textBox(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await textBox(pat.page, win).press('End');
      await textBox(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await textBox(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await tagAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await tagAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await tagOf(sam.page, win, 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Signed by\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = textBox(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await tagAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await tagAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Signed by" (now letter ${want})`;
    });

    await check('walk', "Pat stops typing; the box shows Sam's name tag, and it leaves when Sam does", async ({ shot }) => {
      await textBox(pat.page, win).evaluate((el) => el.blur());
      const tag = await waitFor(async () => (await textBox(pat.page, win).count()) === 0 && (await tagOf(pat.page, win, 'Sam Example').count()) > 0, 15_000, pat.page);
      await shot(pat.page, 'sams-name-tag-on-the-box');
      if (!tag) throw new Error("Pat's box shows no name tag for Sam");
      await textBox(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await tagOf(pat.page, win, 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Pat sees Sam's name tag on the box, and it goes when Sam clicks away";
    });
  },
};
