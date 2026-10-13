// Export and import for a Censai Sheets window: .xlsx (every sheet, with
// formulas) and .csv (the sheet you are looking at).
import { PART, clearParts } from '../../../lib/office/officeParts.js';
import { cellPatch, addSheet } from '../../../lib/office/sheetBook.js';
import { gridPatch, parseCsv, sheetToCsv } from '../../../lib/office/sheetCsv.js';
import { pickFile } from '../../../lib/office/officeFiles.js';

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_CELLS = 40000;

export function useSheetFiles(win, onUpdate, s) {
  const title = win.title || 'Untitled sheet';
  const formats = [
    { ext: 'xlsx', label: 'Excel workbook', hint: 'Every sheet, formulas kept', build: async () => (await import('../../../lib/office/sheetXlsx.js')).bookToXlsx(s.book, s.cells, { title }) },
    { ext: 'csv', label: 'CSV', hint: `Values from "${s.sheet.name}"`, build: async () => new TextEncoder().encode(`\uFEFF${sheetToCsv(s.sheet.id, s.sheetCells, s.calc)}`) },
  ];

  const importFile = async () => {
    const file = await pickFile('.xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is over 8 MB. Split it, or import a CSV of the part you need.');
    const name = file.name.replace(/\.[a-z0-9]+$/i, '');
    if (/\.xlsx$/i.test(file.name)) {
      const { xlsxToBook } = await import('../../../lib/office/sheetXlsx.js');
      const { book, cells } = await xlsxToBook(new Uint8Array(await file.arrayBuffer()));
      const patch = { ...clearParts(win, PART.cell), officeBook: book, title: name };
      let count = 0;
      for (const sheet of book.sheets) {
        for (const [address, cell] of Object.entries(cells[sheet.id] || {})) {
          count += 1;
          if (count > MAX_IMPORT_CELLS) throw new Error('That workbook has more than 40,000 filled cells, which is more than a board sheet holds.');
          Object.assign(patch, cellPatch(sheet.id, address, cell));
        }
      }
      onUpdate?.(patch);
      s.setActiveId(book.sheets[0].id);
      return;
    }
    const grid = parseCsv(await file.text());
    if (grid.length * Math.max(1, ...grid.map((r) => r.length)) > MAX_IMPORT_CELLS) throw new Error('That CSV is bigger than a board sheet holds (40,000 cells).');
    const { book, sheet } = addSheet(s.book, name.slice(0, 31) || 'Import');
    const sized = { ...sheet, rows: Math.max(sheet.rows, grid.length + 10), cols: Math.min(60, Math.max(sheet.cols, ...grid.map((r) => r.length + 1))) };
    onUpdate?.({ ...gridPatch(sized.id, grid), officeBook: { ...book, sheets: book.sheets.map((x) => (x.id === sized.id ? sized : x)) } });
    s.setActiveId(sized.id);
  };

  return { formats, importFile };
}
