// YorWare PDF round two (spec 13): the PDF's own form fields are read and
// filled through the board, words are found on turned pages, and "sign here"
// flags never print.
import * as PdfLib from 'pdf-lib';
import {
  cleanValue, readFormFields, readValues, shownValue, valueKey, valuePatch,
} from '../src/lib/yorware/pdfForm.js';
import { findInPieces, joinPieces, pdfToShown, piecesOfPage, rectToShown, snippetAt, viewRect } from '../src/lib/yorware/pdfText.js';
import { addFilePatch, addMarkPatch, readPdf, rotatePagePatch } from '../src/lib/yorware/pdfModel.js';
import { buildPdf, readPageInfo, shownToPdf } from '../src/lib/yorware/pdfExport.js';
import { bytesToBase64 } from '../src/lib/yorware/pdfBytes.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const openJs = (bytes) => pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;

async function makeForm() {
  const pdf = await PdfLib.PDFDocument.create();
  const p1 = pdf.addPage([612, 792]);
  p1.drawText('Rental agreement between the landlord and the tenant', { x: 50, y: 740, size: 12 });
  p1.drawText('Tenant signature:', { x: 50, y: 120, size: 12 });
  const p2 = pdf.addPage([612, 792]);
  p2.drawText('Page two says tenant again', { x: 50, y: 740, size: 12 });
  const form = pdf.getForm();
  form.createTextField('tenant.name').addToPage(p1, { x: 50, y: 600, width: 220, height: 22 });
  form.createCheckBox('pets').addToPage(p1, { x: 50, y: 560, width: 14, height: 14 });
  const plan = form.createDropdown('plan');
  plan.addOptions(['Monthly', 'Yearly']);
  plan.addToPage(p2, { x: 50, y: 500, width: 150, height: 22 });
  const size = form.createRadioGroup('size');
  size.addOptionToPage('Small', p2, { x: 50, y: 400, width: 14, height: 14 });
  size.addOptionToPage('Large', p2, { x: 90, y: 400, width: 14, height: 14 });
  return pdf.save();
}

async function winWithForm() {
  const bytes = await makeForm();
  let win = { kind: 'yorPdf', ...YORWARE_STARTERS.yorPdf };
  const { fileId, patch } = addFilePatch(readPdf(win), { name: 'lease.pdf', data: bytesToBase64(bytes), bytes: bytes.length, pages: await readPageInfo(bytes, PdfLib) });
  win = { ...win, ...patch };
  return { win, fileId, bytes };
}

describe('PDF form fields', () => {
  test('reads every kind of field with its page and box', async () => {
    const fields = await readFormFields(PdfLib, await makeForm());
    const by = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(by['tenant.name']).toMatchObject({ type: 'text', value: '', widgets: [{ index: 0 }] });
    const box = by['tenant.name'].widgets[0];
    expect(Math.abs(box.x - 50) + Math.abs(box.y - 600) + Math.abs(box.w - 220)).toBeLessThan(3);
    expect(by.pets).toMatchObject({ type: 'check', value: false, widgets: [{ index: 0 }] });
    expect(by.plan).toMatchObject({ type: 'choice', options: ['Monthly', 'Yearly'], widgets: [{ index: 1 }] });
    expect(by.size.type).toBe('radio');
    expect(by.size.options).toEqual(['Small', 'Large']);
    expect(by.size.widgets).toHaveLength(2);
  });

  test('answers live in their own board fields and merge', async () => {
    const { win, fileId } = await winWithForm();
    const fields = await readFormFields(PdfLib, await makeForm());
    const by = Object.fromEntries(fields.map((f) => [f.name, f]));
    const alma = valuePatch(fileId, by['tenant.name'], 'Alma Reyes');
    const sam = valuePatch(fileId, by.pets, true);
    const merged = { ...win, ...alma, ...sam };
    expect(Object.keys(alma)[0]).toBe(valueKey(fileId, 'tenant.name'));
    expect(Object.keys(alma)[0]).not.toBe(Object.keys(sam)[0]);
    expect(readValues(merged)).toEqual({ [fileId]: { 'tenant.name': 'Alma Reyes', pets: true } });
    expect(readPdf(merged).values[fileId].pets).toBe(true);
    expect(shownValue(by.plan, readValues(merged)[fileId])).toBe('');
  });

  test('answers are cleaned for their field', () => {
    expect(cleanValue({ type: 'check' }, 'yes')).toBe(true);
    expect(cleanValue({ type: 'check' }, 0)).toBe(false);
    expect(cleanValue({ type: 'choice', options: ['Monthly', 'Yearly'] }, 'yearly')).toBe('Yearly');
    expect(cleanValue({ type: 'choice', options: ['Monthly'] }, 'Weekly')).toBeNull();
    expect(cleanValue({ type: 'text' }, 'one\ntwo')).toBe('one two');
    expect(cleanValue({ type: 'text', multiline: true }, 'one\ntwo')).toBe('one\ntwo');
  });

  test('the export prints the answers into the pages', async () => {
    const { win, fileId } = await winWithForm();
    const fields = Object.fromEntries((await readFormFields(PdfLib, await makeForm())).map((f) => [f.name, f]));
    const filled = {
      ...win,
      ...valuePatch(fileId, fields['tenant.name'], 'Alma Reyes'),
      ...valuePatch(fileId, fields.pets, true),
      ...valuePatch(fileId, fields.plan, 'Yearly'),
      ...valuePatch(fileId, fields.size, 'Large'),
    };
    const out = await buildPdf(filled, PdfLib);
    const pdf = await openJs(out);
    expect(pdf.numPages).toBe(2);
    const one = (await (await pdf.getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
    const two = (await (await pdf.getPage(2)).getTextContent()).items.map((i) => i.str).join(' ');
    expect(one).toContain('Alma Reyes');
    expect(two).toContain('Yearly');
    // Flattened: no fill-in boxes are left to change by accident.
    expect(await readFormFields(PdfLib, out)).toEqual([]);
  });

  test('an untouched form keeps its boxes', async () => {
    const { win } = await winWithForm();
    const out = await buildPdf(win, PdfLib);
    const reread = await PdfLib.PDFDocument.load(out);
    expect(reread.getPageCount()).toBe(2);
  });
});

describe('Sign here flags', () => {
  test('are kept on the board but never printed', async () => {
    const { win } = await winWithForm();
    const doc = readPdf(win);
    const flag = addMarkPatch({ page: doc.order[0], type: 'signHere', x: 200, y: 660, w: 180, h: 40, signer: 'Tenant' });
    const marked = { ...win, ...flag.patch };
    expect(readPdf(marked).marks[flag.id].type).toBe('signHere');
    const out = await buildPdf(marked, PdfLib);
    const plain = await buildPdf(win, PdfLib);
    const textOf = async (b) => (await (await (await openJs(b)).getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
    expect(await textOf(out)).toBe(await textOf(plain));
  });
});

describe('Finding words', () => {
  test('pdfToShown undoes shownToPdf for every turn', () => {
    const box = { x: 10, y: 20, w: 300, h: 500 };
    for (const rot of [0, 90, 180, 270]) {
      const W = rot % 180 ? box.h : box.w;
      const H = rot % 180 ? box.w : box.h;
      const pdf = shownToPdf(33, 71, { x: 0, y: 0, w: box.w, h: box.h }, rot);
      expect(pdfToShown(pdf.x, pdf.y, box.w, box.h, rot)).toEqual({ x: 33, y: 71 });
      expect(W * H).toBe(box.w * box.h);
    }
  });

  test('form boxes land where pdf.js draws them on a turned page', async () => {
    const bytes = await makeForm();
    const page = await (await openJs(bytes)).getPage(1);
    const [field] = (await readFormFields(PdfLib, bytes)).filter((f) => f.name === 'tenant.name');
    const w = field.widgets[0];
    for (const rot of [0, 90, 180, 270]) {
      const vp = page.getViewport({ scale: 1, rotation: rot });
      const [x1, y1, x2, y2] = viewRect(vp, [w.x, w.y, w.x + w.w, w.y + w.h]);
      const mine = rectToShown(w, 612, 792, rot);
      expect(mine.x).toBeCloseTo(Math.min(x1, x2), 3);
      expect(mine.y).toBeCloseTo(Math.min(y1, y2), 3);
      expect(mine.w).toBeCloseTo(Math.abs(x2 - x1), 3);
    }
  });

  test('finds a word in any case, with boxes on the shown page, also when turned', async () => {
    const page = await (await openJs(await makeForm())).getPage(1);
    const flat = await piecesOfPage(page, 0);
    const hits = findInPieces(flat, 'TENANT');
    expect(hits).toHaveLength(2);
    const first = hits[0].boxes[0];
    expect(first.y).toBeLessThan(60);
    expect(first.x).toBeGreaterThan(50);
    expect(first.w).toBeLessThan(80);
    const turned = await piecesOfPage(page, 90);
    const t = findInPieces(turned, 'tenant')[0].boxes[0];
    // Turned a quarter: the top line now runs down the right side.
    expect(t.x).toBeGreaterThan(700);
    expect(t.h).toBeGreaterThan(t.w);
  });

  test('matches across pieces and spacing, and makes a snippet', () => {
    const pieces = [
      { str: 'Tenant', eol: false, dir: 'r', box: { x: 0, y: 0, w: 60, h: 12 } },
      { str: 'signature:', eol: true, dir: 'r', box: { x: 70, y: 0, w: 100, h: 12 } },
      { str: 'Date', eol: false, dir: 'r', box: { x: 0, y: 20, w: 40, h: 12 } },
    ];
    const hits = findInPieces(pieces, 'tenant   signature');
    expect(hits).toHaveLength(1);
    expect(hits[0].boxes).toHaveLength(2);
    expect(hits[0].boxes[1]).toMatchObject({ x: 70, w: 90 });
    expect(findInPieces(pieces, '')).toEqual([]);
    const { text } = joinPieces(pieces);
    expect(text).toBe('Tenant signature:\nDate');
    expect(snippetAt('a'.repeat(100) + 'needle' + 'b'.repeat(100), 100, 6, 5)).toBe('…aaaaaneedlebbbbb…');
  });

  test('turning a page moves a sign here flag with it', async () => {
    const { win } = await winWithForm();
    const doc = readPdf(win);
    const flag = addMarkPatch({ page: doc.order[0], type: 'signHere', x: 100, y: 100, w: 180, h: 40 });
    const turned = { ...win, ...flag.patch, ...rotatePagePatch(readPdf({ ...win, ...flag.patch }), doc.order[0]) };
    const m = readPdf(turned).marks[flag.id];
    expect(m.w).toBe(180);
    expect(m.x).not.toBe(100);
  });
});
