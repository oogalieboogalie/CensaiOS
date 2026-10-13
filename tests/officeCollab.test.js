// Censai Office files keep each cell, block and slide in its own window
// field, so two people editing different pieces at once both keep their
// work after the CRDT sync.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { cellPatch, makeBook, readCells, removeSheetPatch, addSheet } from '../src/lib/office/sheetBook.js';
import { insertBlocksPatch, makeBlock, readDoc, removeBlockPatch } from '../src/lib/office/docModel.js';
import { insertSlidePatch, makeSlide, readDeck } from '../src/lib/office/slideModel.js';
import { orderedIds } from '../src/lib/office/officeParts.js';
import { OFFICE_STARTERS } from '../src/lib/office/officeStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const frame = { id: 'w1', x: 0, y: 0, w: 800, h: 600 };

function pair(win) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = { wins: [{ ...frame, ...win }] };
  writeStateToDoc(a, null, base, 'local');
  sync();
  const edit = (doc, patch) => writeStateToDoc(doc, base, { wins: [{ ...base.wins[0], ...patch }] }, 'local');
  const read = (doc) => readDocState(doc).wins[0];
  return { a, b, sync, edit, read };
}

describe('Censai Office merges edits from two people', () => {
  test('two people typing in different cells at once keep both', () => {
    const { a, b, sync, edit, read } = pair({ kind: 'officeSheets', officeBook: makeBook() });
    edit(a, cellPatch('s1', 'A1', { v: 'from Alex' }));
    edit(b, cellPatch('s1', 'B2', { v: '=1+1' }));
    sync();
    for (const doc of [a, b]) {
      const cells = readCells(read(doc)).s1;
      expect(cells.A1.v).toBe('from Alex');
      expect(cells.B2.v).toBe('=1+1');
    }
  });

  test('two people adding doc paragraphs at once keep both, in a stable order', () => {
    const start = { kind: 'officeDocs', ...OFFICE_STARTERS.officeDocs };
    const { a, b, sync, edit, read } = pair(start);
    const order = readDoc(start).order;
    edit(a, insertBlocksPatch(order, 'b1', [{ ...makeBlock('p', { text: 'Alex wrote this' }), at: 10 }]).patch);
    edit(b, insertBlocksPatch(order, 'b1', [{ ...makeBlock('h2', { text: 'Sam wrote this' }), at: 20 }]).patch);
    sync();
    const texts = (doc) => { const d = readDoc(read(doc)); return d.order.map((id) => d.blocks[id].text); };
    expect(texts(a)).toEqual(texts(b));
    expect(texts(a)).toEqual(expect.arrayContaining(['', 'Alex wrote this', 'Sam wrote this']));
  });

  test('two people adding slides at once keep both', () => {
    const start = { kind: 'officeSlides', ...OFFICE_STARTERS.officeSlides };
    const { a, b, sync, edit, read } = pair(start);
    const deck = readDeck(start);
    edit(a, insertSlidePatch(deck, 'sl1', makeSlide('section', { title: 'From Alex' })).patch);
    edit(b, insertSlidePatch(deck, 'sl1', makeSlide('section', { title: 'From Sam' })).patch);
    sync();
    expect(readDeck(read(a)).order).toHaveLength(3);
    expect(readDeck(read(a)).order).toEqual(readDeck(read(b)).order);
  });
});

describe('Censai Office models', () => {
  test('removed parts drop out and strays keep their creation order', () => {
    expect(orderedIds(['x', 'gone'], { x: { at: 1 }, late: { at: 9 }, early: { at: 5 } })).toEqual(['x', 'early', 'late']);
    const doc = { officeDoc: { order: ['b1', 'b2'] }, 'ob.b1': { type: 'p', text: 'a' }, 'ob.b2': { type: 'p', text: 'b' } };
    expect(readDoc({ ...doc, ...removeBlockPatch(['b1', 'b2'], 'b1') }).order).toEqual(['b2']);
  });

  test('removing a sheet clears its cells and keeps the others', () => {
    const { book } = addSheet(makeBook(), 'Costs');
    const win = { officeBook: book, ...cellPatch('s1', 'A1', { v: '1' }), ...cellPatch(book.sheets[1].id, 'A1', { v: '2' }) };
    const next = { ...win, ...removeSheetPatch(win, book, book.sheets[1].id) };
    expect(next.officeBook.sheets.map((s) => s.name)).toEqual(['Sheet1']);
    expect(readCells(next)).toEqual({ s1: { A1: { v: '1' } } });
  });

  test('Sheets and Slides sit under Censai Office; Writer moved to the YorWare Suite', () => {
    const sections = buildAddSections({ manifests: WINDOW_MANIFESTS.filter((m) => m.moduleMenu?.show !== false) });
    const office = sections.find((s) => s.label === 'Censai Office');
    expect(office.items.map((i) => i.label)).toEqual(['Sheets', 'Slides']);
    expect(sections.find((s) => s.label === 'YorWare Suite').items.map((i) => i.label)).toEqual(expect.arrayContaining(['Writer', 'PDF']));
  });
});
