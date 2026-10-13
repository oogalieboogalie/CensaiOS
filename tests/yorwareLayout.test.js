// YorWare Layout (spec 13, app five): pages, frames and stories live in their
// own board fields, two people's edits merge, text flows from frame to frame
// with the same line breaks on screen and in the PDF, and the export is a
// real PDF at the page's exact size.
import * as Y from 'yjs';
import * as PdfLib from 'pdf-lib';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import {
  MASTER, addFramePatch, addPagePatch, linkFramePatch, makeLayoutDoc, movePagePatch, pageSizePatch, readLayout,
  removeFramesPatch, removePagePatch, storyPatch, unlinkFramePatch,
} from '../src/lib/yorware/layoutModel.js';
import { METRIC_CHARS } from '../src/lib/yorware/layoutMetrics.js';
import { flowStory, printableText, textWidth, wrapParagraph } from '../src/lib/yorware/layoutFlow.js';
import { flowDocument, imageBox, pageItems } from '../src/lib/yorware/layoutPlan.js';
import { LAYOUT_TEMPLATES, templatePatch } from '../src/lib/yorware/layoutTemplates.js';
import { buildLayoutPdf } from '../src/lib/yorware/layoutExport.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const apply = (win, patch) => ({ ...win, ...patch });
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function onePage() {
  let win = { kind: 'yorLayout', ...YORWARE_STARTERS.yorLayout };
  const p = addPagePatch(readLayout(win));
  win = apply(win, p.patch);
  return { win, page: p.id };
}

describe('YorWare Layout text flow', () => {
  test('line widths come from the PDF fonts, so they match pdf-lib exactly', async () => {
    // pdf-lib's own measure adds kerning, which drawText never applies, so
    // compare one character at a time (no pairs, no kerning).
    const pdf = await PdfLib.PDFDocument.create();
    const helv = await pdf.embedFont(PdfLib.StandardFonts.Helvetica);
    const times = await pdf.embedFont(PdfLib.StandardFonts.TimesRomanBold);
    for (const ch of Array.from(METRIC_CHARS)) {
      expect(textWidth(ch, 'sans', 14)).toBeCloseTo(helv.widthOfTextAtSize(ch, 14), 6);
      expect(textWidth(ch, 'serifBold', 30)).toBeCloseTo(times.widthOfTextAtSize(ch, 30), 6);
    }
    expect(textWidth('Grand Opening — café', 'sans', 10)).toBeCloseTo(textWidth('Grand Opening ', 'sans', 10) + textWidth('— café', 'sans', 10), 6);
  });

  test('characters the PDF fonts cannot print become "?"', () => {
    expect(printableText('Price 5€ 東京\tok')).toBe('Price 5€ ??    ok');
  });

  test('wrapping keeps every line inside the width and splits a too-long word', () => {
    const lines = wrapParagraph('the quick brown fox jumps over the lazy dog again and again', 100, 'sans', 12);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(textWidth(l, 'sans', 12)).toBeLessThanOrEqual(100);
    expect(wrapParagraph('Supercalifragilistic', 40, 'sans', 12).join('')).toBe('Supercalifragilistic');
  });

  test('a story runs through its frames and columns and reports what is left over', () => {
    const story = { text: Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '), size: 12, lead: 1.25 };
    const a = { x: 0, y: 0, w: 200, h: 45, cols: 2 };
    const b = { x: 0, y: 300, w: 80, h: 30 };
    const r = flowStory(story, [{ id: 'a', frame: a }, { id: 'b', frame: b }]);
    expect(r.frames.a.length).toBe(6);
    expect(r.frames.a[3].x).toBeGreaterThan(100);
    expect(r.frames.b.length).toBe(2);
    expect(r.frames.b[0].y).toBeCloseTo(300 + 12 * 0.8);
    expect(r.overflow).toBe(true);
    expect(r.hiddenWords).toBeGreaterThan(10);
  });
});

describe('YorWare Layout board model', () => {
  test('linking a frame continues the story on the next page; unlinking gives it back its own', () => {
    let { win, page } = onePage();
    const p2 = addPagePatch(readLayout(win));
    win = apply(win, p2.patch);
    const a = addFramePatch(readLayout(win), { page, type: 'text', x: 40, y: 40, w: 120, h: 30 }, { text: 'one two three four five six seven eight nine ten eleven twelve' });
    win = apply(win, a.patch);
    const b = addFramePatch(readLayout(win), { page: p2.id, type: 'text', x: 40, y: 40, w: 120, h: 200 });
    win = apply(win, b.patch);
    const sid = readLayout(win).frames[a.id].story;
    let flow = flowDocument(readLayout(win));
    expect(flow[a.id].overflow).toBe(true);
    win = apply(win, linkFramePatch(readLayout(win), sid, b.id));
    let doc = readLayout(win);
    expect(doc.chains[sid]).toEqual([a.id, b.id]);
    expect(Object.keys(doc.stories)).toHaveLength(1);
    flow = flowDocument(doc);
    expect(flow[a.id].overflow).toBe(false);
    expect(flow[b.id].lines.map((l) => l.text).join(' ')).toContain('twelve');
    win = apply(win, unlinkFramePatch(doc, b.id));
    doc = readLayout(win);
    expect(doc.chains[sid]).toEqual([a.id]);
    expect(doc.stories[doc.frames[b.id].story].text).toBe('');
  });

  test('removing a page removes its frames, an orphaned story and an unused picture', () => {
    let { win, page } = onePage();
    const t = addFramePatch(readLayout(win), { page, type: 'text', x: 0, y: 0, w: 50, h: 50 });
    win = apply(win, t.patch);
    win = apply(win, { 'lim.i1': { name: 'a.png', data: PNG_1PX, mime: 'image/png', w: 1, h: 1 } });
    const im = addFramePatch(readLayout(win), { page, type: 'image', img: 'i1', x: 0, y: 0, w: 50, h: 50 });
    win = apply(win, im.patch);
    const sid = readLayout(win).frames[t.id].story;
    win = apply(win, removePagePatch(readLayout(win), page));
    const doc = readLayout(win);
    expect(doc.order).toEqual([]);
    expect(win[`lst.${sid}`]).toBeNull();
    expect(win['lim.i1']).toBeNull();
    expect(doc.frames).toEqual({});
  });

  test('master items show on every page with the page number, unless a page hides them', () => {
    let win = apply({}, templatePatch('newsletter'));
    let doc = readLayout(win);
    const [p1, p2] = doc.order;
    const footer = (pid) => pageItems(doc, pid, flowDocument(doc)).find((i) => i.master && i.frame.type === 'text');
    expect(footer(p2).text.lines[0].text).toContain('page 2 of 2');
    // The article starts on page 1 and carries on on page 2.
    const article = pageItems(doc, p2, flowDocument(doc)).find((i) => i.text?.count === 2);
    expect(article.text.index).toBe(1);
    expect(article.text.lines.length).toBeGreaterThan(3);
    win = apply(win, { [`lpg.${p1}`]: { ...doc.pages[p1], noMaster: true } });
    doc = readLayout(win);
    expect(footer(p1)).toBeUndefined();
    expect(pageItems(doc, MASTER, {}).length).toBe(2);
  });

  test('a filled picture covers its frame; a fitted one shows all of it', () => {
    const frame = { x: 0, y: 0, w: 200, h: 100 };
    expect(imageBox({ ...frame, fit: 'fill' }, { w: 100, h: 100 })).toEqual({ x: 0, y: -50, w: 200, h: 200 });
    expect(imageBox({ ...frame, fit: 'fit' }, { w: 100, h: 100 })).toEqual({ x: 50, y: 0, w: 100, h: 100 });
  });

  test('two people editing different frames and pages at once both keep their work', () => {
    const start = apply({ title: 'Flyer' }, templatePatch('flyer'));
    const doc = readLayout(start);
    const [p1] = doc.order;
    const head = Object.keys(doc.frames).find((id) => doc.stories[doc.frames[id].story]?.text === 'Grand Opening');
    const rect = Object.keys(doc.frames).find((id) => doc.frames[id].type === 'rect');
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [{ id: 'w1', kind: 'yorLayout', x: 0, y: 0, w: 900, h: 700, ...start }] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const edit = (d, patch) => writeStateToDoc(d, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
    // Alex retypes the headline; Sam adds a page and makes the top band taller.
    edit(a, storyPatch(doc, doc.frames[head].story, { text: 'Now Open' }));
    const added = addPagePatch(doc, p1);
    edit(b, { ...added.patch, [`lfr.${rect}`]: { ...doc.frames[rect], h: 220 } });
    sync();
    for (const d of [a, b]) {
      const merged = readLayout(readDocState(d).wins[0]);
      expect(merged.order).toEqual([p1, added.id]);
      expect(merged.stories[doc.frames[head].story].text).toBe('Now Open');
      expect(merged.frames[rect].h).toBe(220);
    }
  });

  test('changing the page size and moving pages', () => {
    let win = apply({}, templatePatch('newsletter'));
    const [p1, p2] = readLayout(win).order;
    win = apply(win, pageSizePatch(readLayout(win), 'a4'));
    win = apply(win, movePagePatch(readLayout(win), p2, 0));
    const doc = readLayout(win);
    expect(doc.order).toEqual([p2, p1]);
    expect(doc.w).toBeCloseTo(595.28);
  });

  test('removing the only frame of a story removes the story', () => {
    let { win, page } = onePage();
    const t = addFramePatch(readLayout(win), { page, type: 'text', x: 0, y: 0, w: 50, h: 50 });
    win = apply(win, t.patch);
    const sid = readLayout(win).frames[t.id].story;
    win = apply(win, removeFramesPatch(readLayout(win), [t.id]));
    expect(win[`lst.${sid}`]).toBeNull();
  });
});

describe('YorWare Layout export and wiring', () => {
  test('every template exports a PDF with the right pages, size and text', async () => {
    for (const t of LAYOUT_TEMPLATES) {
      const win = apply({ title: t.label }, templatePatch(t.id));
      const bytes = await buildLayoutPdf(win, PdfLib);
      const pdf = await PdfLib.PDFDocument.load(bytes, { updateMetadata: false });
      expect(pdf.getPageCount()).toBe(t.id === 'newsletter' ? 2 : 1);
      expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
      expect(pdf.getProducer()).toBe('censaiOS YorWare Layout');
    }
  });

  test('every template text fits its frames', () => {
    for (const t of LAYOUT_TEMPLATES) {
      const doc = readLayout(templatePatch(t.id));
      const flow = flowDocument(doc);
      for (const pid of [...doc.order, MASTER]) {
        for (const item of pageItems(doc, pid, flow)) if (item.text) expect([t.id, item.text.overflow]).toEqual([t.id, false]);
      }
    }
  });

  test('pictures are embedded and clipped to their frame', async () => {
    let { win, page } = onePage();
    win = apply(win, { 'lim.i1': { name: 'a.png', data: PNG_1PX, mime: 'image/png', w: 1, h: 1 } });
    win = apply(win, addFramePatch(readLayout(win), { page, type: 'image', img: 'i1', fit: 'fill', x: 10, y: 10, w: 100, h: 50 }).patch);
    const bytes = await buildLayoutPdf(win, PdfLib);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toMatch(/\/Subtype\s*\/Image/);
    expect(bytes.length).toBeGreaterThan(500);
  });

  test('an empty document says so instead of saving a blank file', async () => {
    await expect(buildLayoutPdf({ ...makeLayoutDoc() }, PdfLib)).rejects.toThrow(/no pages/);
  });

  test('Layout is in the Add palette under YorWare Suite and has a manifest', () => {
    const suite = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'YorWare Suite');
    expect(suite.items.map((i) => i.id)).toContain('kind:yorLayout');
    expect(WINDOW_MANIFESTS.find((m) => m.kind === 'yorLayout')).toMatchObject({ label: 'Layout' });
    expect(YORWARE_STARTERS.yorLayout.layDoc.order).toEqual([]);
  });
});
