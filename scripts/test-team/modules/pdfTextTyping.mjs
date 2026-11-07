// YorWare PDF for two people. Pat Example places a made-up text box on a page
// of a made-up PDF and Sam Example sees its words on the shared board. Then,
// at the same moment, Pat types at the start of the box's words while Sam
// types at the end: both people's words must be whole on both screens, and
// Pat's cursor must stay right after Pat's own words. Then Pat types while Sam
// drags the box: both changes stay. All words are made up.

import * as PdfLib from 'pdf-lib';
import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const MID = 'crewM1';
const markOf = async (page, id) => (await readWindow(page, id))?.[`pm.${MID}`] || {};

async function madeUpPdf() {
  const pdf = await PdfLib.PDFDocument.create();
  pdf.addPage([612, 792]).drawText('Made-up lease for Pat Example', { x: 60, y: 720, size: 18 });
  return Buffer.from(await pdf.save()).toString('base64');
}

async function bothSee(t, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => markOf(p.page, id)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

// Double-clicking a text box on the page opens it for typing.
async function open(page, id) {
  await windowFrame(page, id).getByLabel(/^Text:/).dblclick({ timeout: 15_000 });
  await textBox(page, id).waitFor({ timeout: 10_000 });
}
const textBox = (page, id) => windowFrame(page, id).getByRole('textbox', { name: 'Text on the page' });

export default {
  id: 'pdfTextTyping',
  label: 'YorWare PDF: two people type in one text box on a page',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Sam Example ${run}`, pat: 'Signed: ', sam: ', witness' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', 'Pat puts words on a made-up PDF and Sam sees them', async ({ shot }) => {
      const data = await madeUpPdf();
      win = await spawnWindow(pat.page, 'yorPdf', {
        title: 'Made-up lease',
        pdfDoc: { order: ['crewP1'] },
        'pf.crewF1': { name: 'made-up-lease.pdf', data, bytes: data.length, at: 1 },
        'pp.crewP1': { file: 'crewF1', index: 0, w: 612, h: 792, rot: 0, at: 1 },
        [`pm.${MID}`]: { page: 'crewP1', type: 'text', text: '', size: 18, x: 60, y: 200, w: 40, h: 26, at: 1 },
      }, { x: 40, y: 40 }, { w: 1000, h: 760 });
      await open(pat.page, win);
      await textBox(pat.page, win).pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, (m) => m.text === W.start);
      await open(sam.page, win);
      await shot(sam.page, 'sam-sees-the-words');
      if (samSaw.text !== W.start) throw new Error(`Sam's copy reads "${samSaw.text ?? ''}"`);
      return 'Sam has the same words, letter for letter';
    });

    await check('walk', 'Pat and Sam type in one text box at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [textBox(pat.page, win), textBox(sam.page, win)];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, (m) => m.text === want);
      await sideBySide(t, 'both-typed-in-one-box', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((m) => m.text !== want);
      if (bad) throw new Error(`a screen's text box reads "${bad.text}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same words with Pat's and Sam's whole; Pat's cursor stayed after Pat's words";
    });

    await check('walk', 'Pat types while Sam drags the text box; both stay', async ({ shot }) => {
      const before = (await markOf(pat.page, win)).text;
      const startX = (await markOf(pat.page, win)).x;
      const patBox = textBox(pat.page, win);
      await sam.page.keyboard.press('Escape');
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      const mark = windowFrame(sam.page, win).getByLabel(/^Text:/);
      const at = await mark.boundingBox();
      await Promise.all([
        patBox.pressSequentially('!', { delay: 40 }),
        (async () => {
          await sam.page.mouse.move(at.x + 10, at.y + at.height / 2);
          await sam.page.mouse.down();
          await sam.page.mouse.move(at.x + 90, at.y + at.height / 2 + 60, { steps: 6 });
          await sam.page.mouse.up();
        })(),
      ]);
      const want = `${before}!`;
      const seen = await bothSee(t, win, (m) => m.text === want && m.x > startX);
      await sideBySide(t, 'words-and-drag-at-once', shot);
      const bad = seen.find((m) => m.text !== want || !(m.x > startX));
      if (bad) throw new Error(`a screen holds "${bad.text}" at x ${bad.x}`);
      return "both screens hold Pat's words and the place Sam dragged the box to";
    });
  },
};
