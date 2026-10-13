// YorWare Writer: page breaks, word counts, Letter and A4 exports, and Word
// files read back in (a Writer .docx round-trips through mammoth).
import { strFromU8, unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import { countWords, pageBox, PAGE_SIZES, pageSizeOf, planPageBreaks } from '../src/lib/office/docPages.js';
import { htmlToBlocks } from '../src/lib/office/docHtml.js';
import { docxToDoc } from '../src/lib/office/docxImport.js';
import { docToDocx } from '../src/lib/office/docDocx.js';
import { docToPdf } from '../src/lib/office/docPdf.js';
import { markdownToBlocks } from '../src/lib/office/docMarkdown.js';

const { DOMParser } = new JSDOM('').window;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGPQPnIbjhhwcgCamhV5o06STwAAAABJRU5ErkJggg==';
const toDoc = (list) => ({ order: list.map((_, i) => `b${i}`), blocks: Object.fromEntries(list.map((b, i) => [`b${i}`, b])) });

beforeAll(() => { globalThis.DOMParser = DOMParser; });
afterAll(() => { delete globalThis.DOMParser; });

describe('pages', () => {
  test('Letter and A4 sheets with one-inch margins; no page size means the old flowing view', () => {
    expect(pageBox(PAGE_SIZES.letter)).toEqual({ width: 816, height: 1056, margin: 96, contentHeight: 864 });
    expect(pageBox(PAGE_SIZES.a4).height).toBe(1122);
    expect(pageSizeOf({ docPage: 'a4' }).label).toBe('A4');
    expect(pageSizeOf({})).toBeNull();
  });

  test('a row that would cross the bottom of a page moves to the next page', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, top: i * 30, height: 30 }));
    const plan = planPageBreaks(rows, 100);
    // 3 rows fit on each 100 px page (90 px used, 10 px left blank).
    expect(plan.breaks).toEqual({ r3: 10, r6: 10, r9: 10 });
    expect(plan.pages).toBe(4);
    expect(plan.tail).toBe(70);
  });

  test('a heading at the foot of a page moves down with the paragraph under it', () => {
    const rows = [{ id: 'a', top: 0, height: 60 }, { id: 'h', top: 60, height: 20, keepWithNext: true }, { id: 'p', top: 80, height: 40 }];
    expect(planPageBreaks(rows, 100).breaks).toEqual({ h: 40 });
  });

  test('a row taller than a page starts a fresh page and runs over', () => {
    const plan = planPageBreaks([{ id: 'a', top: 0, height: 40 }, { id: 'big', top: 40, height: 250 }, { id: 'c', top: 290, height: 20 }], 100);
    expect(plan.breaks).toEqual({ big: 60 });
    // big fills pages 2 to 4; c fits under it on page 4.
    expect(plan.pages).toBe(4);
    expect(plan.tail).toBe(30);
  });

  test('word count reads text, table cells and link words, not link addresses', () => {
    const doc = toDoc([{ type: 'p', text: 'We ship **censaiOS** on [Friday](https://censai.app).' }, { type: 'table', rows: [['Who', 'What'], ['Alex', '']] }, { type: 'divider' }]);
    expect(countWords(doc, 'Launch plan')).toBe(2 + 5 + 3);
  });
});

describe('exports follow the page size', () => {
  const doc = toDoc([{ type: 'p', text: 'Hello' }]);
  test('A4 Word file sets the A4 sheet and one-inch margins', async () => {
    const xml = strFromU8(unzipSync(await docToDocx(doc, { title: 'Letter', page: 'a4' }))['word/document.xml']);
    expect(xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(xml).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
  });
  test('A4 and Letter PDFs have the right sheet size', async () => {
    const box = async (page) => /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(Buffer.from(await docToPdf(doc, { page })).toString('latin1')).slice(1).map(Number);
    expect(await box('letter')).toEqual([612, 792]);
    const [w, h] = await box('a4');
    expect(Math.round(w)).toBe(595);
    expect(Math.round(h)).toBe(842);
  });
});

describe('Word import', () => {
  test('mammoth HTML turns into Writer blocks with marks, lists, tables and pictures', () => {
    const html = '<h1>Plan</h1><p>We ship <strong>censaiOS</strong> on <em>Friday </em>. See <a href="https://censai.app">site</a>.</p>'
      + '<ol><li>Record<ul><li>Edit</li></ul></li></ol><table><tr><td><p>Who</p></td><td><p>What</p></td></tr><tr><td><p>Alex</p></td></tr></table>'
      + `<p><img src="${PNG}" alt="dot" /></p><h4>Small</h4><p></p><blockquote><p>Calm.</p></blockquote>`;
    expect(htmlToBlocks(html)).toEqual([
      { type: 'h1', text: 'Plan' },
      { type: 'p', text: 'We ship **censaiOS** on *Friday* . See [site](https://censai.app).' },
      { type: 'number', text: 'Record' },
      { type: 'bullet', text: 'Edit' },
      { type: 'table', rows: [['Who', 'What'], ['Alex', '']] },
      { type: 'image', src: PNG, alt: 'dot' },
      { type: 'h3', text: 'Small' },
      { type: 'quote', text: 'Calm.' },
    ]);
  });

  test('a Writer .docx comes back as the same document', async () => {
    const md = 'We ship **censaiOS** on *Friday*. See [site](https://censai.app).\n\n## Steps\n\n1. Record demo\n2. Post the clip\n\n- Tavily\n- Writer\n\n| Who | What |\n| --- | --- |\n| Alex | Demo |\n\n'
      + `![dot](${PNG})\n`;
    const list = markdownToBlocks(md).map((b) => (b.type === 'image' ? { ...b, w: 4, h: 3 } : b));
    const bytes = await docToDocx(toDoc(list), { title: 'Launch plan' });
    const back = await docxToDoc(Buffer.from(bytes));
    expect(back.title).toBe('Launch plan');
    expect(back.blocks.map((b) => b.type)).toEqual(['p', 'h2', 'number', 'number', 'bullet', 'bullet', 'table', 'image']);
    expect(back.blocks[0].text).toBe(list[0].text);
    expect(back.blocks[6].rows).toEqual([['Who', 'What'], ['Alex', 'Demo']]);
    expect(back.blocks[7].src).toMatch(/^data:image\/png;base64,/);
  });
});
