// .xlsx in and out for Censai Sheets, through ExcelJS (loaded on demand so
// the canvas bundle stays small). Formulas are written as real Excel
// formulas with their computed result cached, so the file opens with values
// in Excel, Numbers, LibreOffice and Google Sheets.
import { addr, colIndex, colName, parseAddr } from './cellRef.js';
import { makeSheet } from './sheetBook.js';
import { evaluateBook, isFormula } from './sheetEval.js';
import { parseFormula } from './formulaParse.js';
import { dateSerial } from './formulaFns.js';
import { isErr } from './formulaValues.js';

const EXCEL_ERRORS = new Set(['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!']);
const NUM_FMT = { number: '#,##0.00', currency: '"$"#,##0.00', percent: '0.00%', date: 'yyyy-mm-dd' };
const FILL = 'FFDCF4F8';
const PX_PER_CHAR = 7;

async function loadExcel() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

function cellValue(raw, computed) {
  if (isFormula(raw)) {
    try {
      parseFormula(raw);
    } catch {
      return raw;
    }
    const result = isErr(computed)
      ? { error: EXCEL_ERRORS.has(computed.err) ? computed.err : '#VALUE!' }
      : computed ?? undefined;
    return { formula: raw.slice(1), result };
  }
  if (raw.startsWith("'")) return raw.slice(1);
  return computed;
}

/** Workbook -> .xlsx bytes (Uint8Array). */
export async function bookToXlsx(book, cells, { title = 'Censai Sheets' } = {}) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'censaiOS';
  wb.title = title;
  wb.created = new Date();
  const calc = evaluateBook(book, cells);
  for (const sheet of book.sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const [col, px] of Object.entries(sheet.widths || {})) {
      ws.getColumn(colIndex(col) + 1).width = Math.max(4, Math.round(px / PX_PER_CHAR));
    }
    for (const [address, cell] of Object.entries(cells[sheet.id] || {})) {
      if (!parseAddr(address)) continue;
      const target = ws.getCell(address);
      const raw = String(cell.v ?? '');
      if (raw !== '') target.value = cellValue(raw, calc.value(sheet.id, address));
      const s = cell.s || {};
      if (s.b || s.i || s.u) target.font = { bold: Boolean(s.b), italic: Boolean(s.i), underline: Boolean(s.u) };
      if (s.align) target.alignment = { horizontal: s.align };
      if (NUM_FMT[s.fmt]) target.numFmt = NUM_FMT[s.fmt];
      if (s.fill) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL } };
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

function fmtFromNumFmt(numFmt) {
  const f = String(numFmt || '').toLowerCase();
  if (!f || f === 'general') return null;
  if (f.includes('%')) return 'percent';
  if (f.includes('$') || f.includes('€') || f.includes('£')) return 'currency';
  if (/[dy]/.test(f) && f.includes('m')) return 'date';
  if (/[0#]/.test(f)) return 'number';
  return null;
}

function rawFromCell(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return String(dateSerial(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())));
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).toUpperCase();
  if (typeof v === 'string') return isFormula(v) ? `'${v}` : v;
  if (v.formula || v.sharedFormula) {
    const formula = cell.formula || v.formula;
    if (formula) return `=${formula}`;
    return v.result === undefined || v.result === null ? '' : String(v.result?.error || v.result);
  }
  if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join('');
  if (v.text !== undefined) return String(v.text?.richText ? v.text.richText.map((p) => p.text).join('') : v.text);
  if (v.error) return v.error;
  return String(v);
}

/** .xlsx bytes -> { book, cells } (every sheet, values, formulas, basic styles). */
export async function xlsxToBook(bytes) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const book = { sheets: [] };
  const cells = {};
  wb.eachSheet((ws, index) => {
    const sheet = makeSheet(String(ws.name || `Sheet${index}`).slice(0, 31), `s${book.sheets.length + 1}`);
    const sheetCells = {};
    let maxRow = 0;
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = rawFromCell(cell);
      const s = {};
      if (cell.font?.bold) s.b = true;
      if (cell.font?.italic) s.i = true;
      if (cell.font?.underline) s.u = true;
      if (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid') s.fill = true;
      if (['left', 'center', 'right'].includes(cell.alignment?.horizontal)) s.align = cell.alignment.horizontal;
      const fmt = cell.value instanceof Date ? 'date' : fmtFromNumFmt(cell.numFmt);
      if (fmt) s.fmt = fmt;
      if (raw === '' && !Object.keys(s).length) return;
      const p = parseAddr(cell.address);
      if (!p) return;
      maxRow = Math.max(maxRow, p.row + 1);
      maxCol = Math.max(maxCol, p.col + 1);
      sheetCells[addr(p.col, p.row)] = Object.keys(s).length ? { v: raw, s } : { v: raw };
    }));
    (ws.columns || []).forEach((column, i) => {
      if (column?.width) sheet.widths[colName(i)] = Math.round(column.width * PX_PER_CHAR);
    });
    sheet.rows = Math.max(sheet.rows, maxRow + 10);
    sheet.cols = Math.max(sheet.cols, maxCol + 2);
    book.sheets.push(sheet);
    cells[sheet.id] = sheetCells;
  });
  if (!book.sheets.length) book.sheets.push(makeSheet('Sheet1', 's1'));
  return { book, cells };
}
