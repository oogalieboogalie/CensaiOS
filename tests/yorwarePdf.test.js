// YorWare PDF (spec 13): pages and marks live in their own board fields, two
// people's edits merge, and the export bakes the order, rotation and marks
// into a real PDF.
import * as Y from 'yjs';
import * as PdfLib from 'pdf-lib';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  addFilePatch, addMarkPatch, movePagePatch, readPdf, removePagesPatch, rotatePagePatch, shownSize, textBox,
} from '../src/lib/yorware/pdfModel.js';
import { buildPdf, printable, readPageInfo, shownToPdf, strokesToPath } from '../src/lib/yorware/pdfExport.js';
import { base64ToBytes, bytesToBase64, looksLikePdf } from '../src/lib/yorware/pdfBytes.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

async function makePdf(sizes) {
  const pdf = await PdfLib.PDFDocument.create();
  sizes.forEach(([w, h], i) => pdf.addPage([w, h]).drawText(`Source page ${i + 1}`, { x: 20, y: h - 40, size: 12 }));
  return pdf.save();
}

async function winWith(...files) {
  let win = { kind: 'yorPdf', ...YORWARE_STARTERS.yorPdf };
  for (const [name, sizes] of files) {
    const bytes = await makePdf(sizes);
    const { patch } = addFilePatch(readPdf(win), { name, data: bytesToBase64(bytes), bytes: bytes.length, pages: await readPageInfo(bytes, PdfLib) });
    win = { ...win, ...patch };
  }
  return win;
}
const apply = (win, patch) => ({ ...win, ...patch });

describe('YorWare PDF board model', () => {
  test('adding two PDFs appends their pages in order', async () => {
    const win = await winWith(['a.pdf', [[612, 792], [612, 792]]], ['b.pdf', [[400, 300]]]);
    const doc = readPdf(win);
    expect(doc.order).toHaveLength(3);
    expect(Object.keys(doc.files)).toHaveLength(2);
    expect(doc.pages[doc.order[2]]).toMatchObject({ index: 0, w: 400, h: 300, rot: 0 });
  });

  test('moving, turning and deleting pages', async () => {
    let win = await winWith(['a.pdf', [[612, 792], [612, 792]]], ['b.pdf', [[400, 300]]]);
    const [p1, p2, p3] = readPdf(win).order;
    win = apply(win, movePagePatch(readPdf(win), p3, 0));
    expect(readPdf(win).order).toEqual([p3, p1, p2]);
    win = apply(win, rotatePagePatch(readPdf(win), p3));
    expect(shownSize(readPdf(win).pages[p3])).toEqual({ w: 300, h: 400 });
    const mark = addMarkPatch({ page: p3, type: 'redact', x: 0, y: 0, w: 10, h: 10 });
    win = apply(win, mark.patch);
    win = apply(win, removePagesPatch(readPdf(win), [p3]));
    const doc = readPdf(win);
    expect(doc.order).toEqual([p1, p2]);
    expect(doc.marks).toEqual({});
    expect(Object.keys(doc.files)).toHaveLength(1);
    expect(win[`pm.${mark.id}`]).toBeNull();
  });

  test('turning a page keeps text upright and turns blacked-out boxes with the page', async () => {
    let win = await winWith(['a.pdf', [[600, 800]]]);
    const [p] = readPdf(win).order;
    const box = addMarkPatch({ page: p, type: 'redact', x: 100, y: 50, w: 200, h: 20 });
    const txt = addMarkPatch({ page: p, type: 'text', text: 'Hi', size: 14, x: 100, y: 50, w: 40, h: 20 });
    win = apply(apply(win, box.patch), txt.patch);
    win = apply(win, rotatePagePatch(readPdf(win), p));
    const doc = readPdf(win);
    // Shown height before turning was 800: (x, y) -> (800 - y - h, x).
    expect(doc.marks[box.id]).toMatchObject({ x: 730, y: 100, w: 20, h: 200 });
    // Text keeps its size; its center (120, 60) moves to (740, 120).
    expect(doc.marks[txt.id]).toMatchObject({ x: 720, y: 110, w: 40, h: 20 });
  });

  test('two people: one reorders pages while the other signs a page', async () => {
    const start = await winWith(['a.pdf', [[612, 792], [612, 792], [612, 792]]]);
    const [p1, p2, p3] = readPdf(start).order;
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [{ id: 'w1', x: 0, y: 0, w: 900, h: 700, ...start }] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const edit = (d, patch) => writeStateToDoc(d, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
    edit(a, movePagePatch(readPdf(start), p3, 0));
    const sign = addMarkPatch({ page: p2, type: 'sign', strokes: [[0, 0, 1, 1]], x: 10, y: 10, w: 90, h: 30 });
    edit(b, sign.patch);
    sync();
    for (const d of [a, b]) {
      const doc = readPdf(readDocState(d).wins[0]);
      expect(doc.order).toEqual([p3, p1, p2]);
      expect(doc.marksByPage[p2]).toEqual([sign.id]);
    }
  });

  test('the Add palette lists Writer, PDF and Diagrams under YorWare Suite', () => {
    const sections = buildAddSections({ manifests: WINDOW_MANIFESTS });
    const suite = sections.find((s) => s.label === 'YorWare Suite');
    expect(suite.items.map((i) => i.id)).toEqual(expect.arrayContaining(['kind:officeDocs', 'kind:yorPdf', 'kind:yorDiagrams']));
  });
});

describe('YorWare PDF export', () => {
  test('shown-page points land in the right place for every rotation', () => {
    const box = { x: 0, y: 0, w: 600, h: 800 };
    expect(shownToPdf(10, 20, box, 0)).toEqual({ x: 10, y: 780 });
    expect(shownToPdf(10, 20, box, 90)).toEqual({ x: 20, y: 10 });
    expect(shownToPdf(10, 20, box, 180)).toEqual({ x: 590, y: 20 });
    expect(shownToPdf(10, 20, box, 270)).toEqual({ x: 580, y: 790 });
  });

  test('helpers', () => {
    expect(printable('Café ✓')).toBe('Café ?');
    expect(strokesToPath([[0, 0, 0.5, 1]], 100, 40)).toBe('M 0 0 L 50 40');
    expect(textBox('Hello', 10).w).toBeGreaterThan(20);
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
    expect(looksLikePdf(bytes)).toBe(true);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  test('the saved PDF has the new order, turn and every mark', async () => {
    let win = await winWith(['contract.pdf', [[612, 792], [612, 792]]], ['appendix.pdf', [[400, 300]]]);
    const [p1, p2, p3] = readPdf(win).order;
    win = apply(win, movePagePatch(readPdf(win), p3, 1));
    win = apply(win, rotatePagePatch(readPdf(win), p2));
    for (const fields of [
      { page: p1, type: 'text', text: 'Signed by Alex', size: 14, x: 72, y: 600, w: 140, h: 22 },
      { page: p1, type: 'sign', strokes: [[0, 0.5, 0.5, 0, 1, 0.5]], x: 72, y: 640, w: 120, h: 40 },
      { page: p1, type: 'highlight', x: 20, y: 20, w: 100, h: 16 },
      { page: p2, type: 'redact', x: 10, y: 10, w: 50, h: 20 },
    ]) win = apply(win, addMarkPatch(fields).patch);

    const out = await PdfLib.PDFDocument.load(await buildPdf(win, PdfLib));
    const pages = out.getPages();
    expect(pages.map((pg) => [pg.getWidth(), pg.getHeight()])).toEqual([[612, 792], [400, 300], [612, 792]]);
    expect(pages.map((pg) => pg.getRotation().angle)).toEqual([0, 0, 90]);

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const saved = await buildPdf(win, PdfLib);
    const task = pdfjs.getDocument({ data: new Uint8Array(saved), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
    const read = await task.promise;
    const text = async (n) => (await (await read.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ');
    expect(await text(1)).toContain('Signed by Alex');
    expect(await text(1)).toContain('Source page 1');
    expect(await text(2)).toContain('Source page 1');
    expect(await text(3)).toContain('Source page 2');
    const ops = await (await read.getPage(1)).getOperatorList();
    expect(ops.fnArray.length).toBeGreaterThan(10);
    await task.destroy();
  });

  test('blacked-out pages are saved as pictures, so the covered words are gone', async () => {
    let win = await winWith(['a.pdf', [[612, 792], [612, 792]]]);
    const [p1, p2] = readPdf(win).order;
    win = apply(win, rotatePagePatch(readPdf(win), p2));
    win = apply(win, addMarkPatch({ page: p2, type: 'redact', x: 10, y: 10, w: 200, h: 30 }).patch);
    const png = base64ToBytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    const asked = [];
    const flatten = async (bytes, indexes) => { asked.push(...indexes); return Object.fromEntries(indexes.map((i) => [i, png])); };
    const saved = await buildPdf(win, PdfLib, { flatten });
    expect(asked).toEqual([1]);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(saved), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
    const read = await task.promise;
    const text = async (n) => (await (await read.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ');
    expect(await text(1)).toContain('Source page 1');
    expect(await text(2)).toBe('');
    const out = await PdfLib.PDFDocument.load(saved);
    expect(out.getPages().map((pg) => [pg.getWidth(), pg.getHeight(), pg.getRotation().angle])).toEqual([[612, 792, 0], [792, 612, 0]]);
    await task.destroy();
    expect(p1).toBeTruthy();
  });

  test('an empty window says to open a PDF first', async () => {
    await expect(buildPdf({ kind: 'yorPdf', ...YORWARE_STARTERS.yorPdf }, PdfLib)).rejects.toThrow('Open a PDF first');
  });
});
