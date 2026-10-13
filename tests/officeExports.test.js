// Censai Office exports are real files: unzip them and read the XML, parse
// the workbook back, and check the PDFs hold the text and page count.
import { strFromU8, unzipSync } from 'fflate';
import { bookToXlsx, xlsxToBook } from '../src/lib/office/sheetXlsx.js';
import { gridPatch, parseCsv, sheetToCsv } from '../src/lib/office/sheetCsv.js';
import { evaluateBook } from '../src/lib/office/sheetEval.js';
import { readCells } from '../src/lib/office/sheetBook.js';
import { docToDocx } from '../src/lib/office/docDocx.js';
import { docToPdf } from '../src/lib/office/docPdf.js';
import { docToMarkdown, markdownToBlocks } from '../src/lib/office/docMarkdown.js';
import { deckToPdf, deckToPptx } from '../src/lib/office/slideExport.js';
import { makeSlide } from '../src/lib/office/slideModel.js';

// A real 4x3 PNG in the brand cyan.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGPQPnIbjhhwcgCamhV5o06STwAAAABJRU5ErkJggg==';

const files = (bytes) => unzipSync(bytes);
const text = (zip, name) => strFromU8(zip[name]);
const pdfText = (bytes) => Buffer.from(bytes).toString('latin1');

describe('Sheets export and import', () => {
  const book = { sheets: [{ id: 's1', name: 'Budget', widths: { A: 160 } }, { id: 's2', name: 'Q3 plan' }] };
  const cells = {
    s1: {
      A1: { v: 'Item', s: { b: true, fill: true } }, B1: { v: 'Cost', s: { b: true, align: 'right' } },
      A2: { v: 'Rent' }, B2: { v: '1200', s: { fmt: 'currency' } }, A3: { v: 'Food, drink' }, B3: { v: '450.5' },
      A4: { v: 'Total' }, B4: { v: '=SUM(B2:B3)' }, C4: { v: '=1/0' }, D4: { v: "='Q3 plan'!A1*2" },
    },
    s2: { A1: { v: '21' } },
  };

  test('.xlsx holds every sheet, real formulas with cached results, and styles', async () => {
    const zip = files(await bookToXlsx(book, cells, { title: 'Budget' }));
    expect(text(zip, 'xl/workbook.xml')).toMatch(/<sheet sheetId="1" name="Budget".*<sheet sheetId="2" name="Q3 plan"/s);
    const sheet1 = text(zip, 'xl/worksheets/sheet1.xml');
    expect(sheet1).toMatch(/<c r="B4"[^>]*><f>SUM\(B2:B3\)<\/f><v>1650.5<\/v><\/c>/);
    expect(sheet1).toMatch(/<c r="C4"[^>]*t="e"><f>1\/0<\/f><v>#DIV\/0!<\/v>/);
    expect(sheet1).toMatch(/<c r="D4"[^>]*><f>&apos;Q3 plan&apos;!A1\*2<\/f><v>42<\/v>/);
    expect(sheet1).toMatch(/<col min="1" max="1" width="23"/);
    expect(text(zip, 'xl/styles.xml')).toMatch(/formatCode="&quot;\$&quot;#,##0.00"/);
  });

  test('.xlsx reads back into the same workbook', async () => {
    const back = await xlsxToBook(await bookToXlsx(book, cells));
    expect(back.book.sheets.map((s) => s.name)).toEqual(['Budget', 'Q3 plan']);
    const [s1, s2] = back.book.sheets.map((s) => back.cells[s.id]);
    expect(s1.B4).toEqual({ v: '=SUM(B2:B3)' });
    expect(s1.A1).toEqual({ v: 'Item', s: { b: true, fill: true } });
    expect(s1.B2.s.fmt).toBe('currency');
    expect(s2.A1.v).toBe('21');
    const calc = evaluateBook(back.book, back.cells);
    expect(calc.value(back.book.sheets[0].id, 'D4')).toBe(42);
  });

  test('.csv quotes what needs quoting and reads back', () => {
    const calc = evaluateBook(book, cells);
    const csv = sheetToCsv('s1', cells.s1, calc);
    expect(csv.split('\r\n')).toEqual(['Item,Cost,,', 'Rent,1200,,', '"Food, drink",450.5,,', 'Total,1650.5,#DIV/0!,42']);
    expect(parseCsv(csv)[2]).toEqual(['Food, drink', '450.5', '', '']);
    expect(parseCsv('a;b\n"x ""y""";2\n')).toEqual([['a', 'b'], ['x "y"', '2']]);
  });

  test('imported CSV text never runs as a formula', () => {
    const patch = gridPatch('s9', [['=1+1', 'ok']]);
    const cellsBack = readCells(patch);
    expect(cellsBack.s9.A1.v).toBe("'=1+1");
    expect(evaluateBook({ sheets: [{ id: 's9', name: 'X' }] }, cellsBack).value('s9', 'A1')).toBe('=1+1');
  });
});

describe('Docs export', () => {
  const md = `# Launch plan\n\nWe ship **censaiOS** on *Friday*. See [site](https://censai.app).\n\n1. Record demo\n2. Post the clip\n\n- Tavily\n- Docs\n\n> Keep it calm.\n\n| Who | What |\n| --- | --- |\n| Alex | Demo |\n\n---\n\n\`\`\`\nnpm run dev\n\`\`\`\n\n![dot](${PNG})\n`;
  const list = markdownToBlocks(md);
  const doc = { order: list.map((_, i) => `b${i}`), blocks: Object.fromEntries(list.map((b, i) => [`b${i}`, { ...b, w: 4, h: 3 }])) };

  test('markdown reads into every block type and writes back', () => {
    expect(list.map((b) => b.type)).toEqual(['h1', 'p', 'number', 'number', 'bullet', 'bullet', 'quote', 'table', 'divider', 'code', 'image']);
    expect(list[7].rows).toEqual([['Who', 'What'], ['Alex', 'Demo']]);
    const again = markdownToBlocks(docToMarkdown(doc));
    expect(again.map((b) => b.type)).toEqual(list.map((b) => b.type));
    expect(again[1].text).toBe(list[1].text);
  });

  test('.docx is a real Word document with headings, lists, a table and the picture', async () => {
    const zip = files(await docToDocx(doc, { title: 'Launch plan' }));
    const xml = text(zip, 'word/document.xml');
    expect(xml).toMatch(/<w:pStyle w:val="Title"\/>.*Launch plan/s);
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>/);
    expect(xml).toContain('<w:t xml:space="preserve">censaiOS</w:t>');
    expect(xml).toMatch(/<w:b\/>.*censaiOS/s);
    expect(xml).toMatch(/<w:numPr>/);
    expect(xml).toMatch(/<w:tbl>.*Alex.*Demo.*<\/w:tbl>/s);
    expect(xml).toContain('<w:drawing>');
    expect(text(zip, 'word/_rels/document.xml.rels')).toContain('https://censai.app');
    expect(Object.keys(zip).some((n) => /^word\/media\/.+\.png$/.test(n))).toBe(true);
    expect(text(zip, 'word/numbering.xml')).toContain('w:val="decimal"');
  });

  test('.pdf carries the text', async () => {
    const pdf = pdfText(await docToPdf(doc, { title: 'Launch plan' }));
    expect(pdf.startsWith('%PDF-')).toBe(true);
    for (const words of ['Launch plan', 'censaiOS', 'Record demo', 'Keep it calm.', 'npm run dev']) expect(pdf).toContain(`(${words}`);
    expect(pdf).toContain('/URI (https://censai.app)');
    expect(pdf).toMatch(/\/Subtype \/Image/);
  });
});

describe('Slides export', () => {
  const a = makeSlide('title', { title: 'censaiOS', subtitle: 'The canvas for everyone, and everything.' });
  const b = makeSlide('titleBody', { title: 'Why now', body: '- Teams live on canvases\n- Agents need a place to work' });
  b.blocks.push({ id: 'pic', type: 'image', x: 60, y: 30, w: 30, h: 40, src: PNG, iw: 4, ih: 3 });
  b.notes = 'Pause here.';
  const deck = { order: ['a', 'b'], slides: { a, b }, theme: 'censai' };

  test('.pptx has both slides, their text, bullets, the picture and notes', async () => {
    const zip = files(await deckToPptx(deck, { title: 'Pitch' }));
    expect(text(zip, 'ppt/presentation.xml').match(/<p:sldId /g)).toHaveLength(2);
    expect(text(zip, 'ppt/slides/slide1.xml')).toContain('<a:t>censaiOS</a:t>');
    const slide2 = text(zip, 'ppt/slides/slide2.xml');
    expect(slide2).toContain('<a:t>Teams live on canvases</a:t>');
    expect(slide2).toMatch(/<a:buChar /);
    expect(slide2).toContain('<p:pic>');
    expect(slide2).toContain('0E0E0E');
    expect(text(zip, 'ppt/notesSlides/notesSlide2.xml')).toContain('Pause here.');
  });

  test('.pdf has one 16:9 page per slide', async () => {
    const pdf = pdfText(await deckToPdf(deck, { title: 'Pitch' }));
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(pdf).toContain('/MediaBox [0 0 720. 405.]');
    expect(pdf).toContain('(Why now)');
  });
});
