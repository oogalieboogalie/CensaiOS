// Censai Sheets workbook model. The workbook outline (sheet names, sizes,
// column widths, charts) is the `officeBook` window field; cells are parts
// (see officeParts.js). Pure, no React.
//
//   officeBook  { sheets: [{ id, name, rows, cols, widths: { A: 120 }, charts: [] }] }
//   cell        { v: 'typed input or =formula', s?: { b, i, u, align, fmt, fill } }
//   chart       { id, type: 'bar' | 'line', range: 'A1:B6', title }
import { PART, clearParts, newPartId, partKey, readParts } from './officeParts.js';
import { formatGeneral, isErr } from './formulaValues.js';
import { serialToDate } from './formulaFns.js';

export const DEFAULT_ROWS = 60;
export const DEFAULT_COLS = 14;
export const MAX_ROWS = 2000;
export const MAX_COLS = 60;
export const NUMBER_FORMATS = Object.freeze(['general', 'number', 'currency', 'percent', 'date']);

export function makeSheet(name = 'Sheet1', id = newPartId('s')) {
  return { id, name, rows: DEFAULT_ROWS, cols: DEFAULT_COLS, widths: {}, charts: [] };
}

export function makeBook() {
  return { sheets: [makeSheet('Sheet1', 's1')] };
}

export function normalizeBook(book) {
  if (!book || !Array.isArray(book.sheets) || !book.sheets.length) return makeBook();
  return book;
}

/** All cells by sheet: { s1: { A1: { v, s } } }. */
export function readCells(win) {
  const out = {};
  for (const [key, cell] of Object.entries(readParts(win, PART.cell))) {
    const dot = key.indexOf('.');
    if (dot < 1) continue;
    const sheetId = key.slice(0, dot);
    (out[sheetId] ||= {})[key.slice(dot + 1)] = cell;
  }
  return out;
}

export function cellKey(sheetId, address) {
  return partKey(PART.cell, sheetId, address);
}

/** A patch for one cell; an empty, unstyled cell is removed. */
export function cellPatch(sheetId, address, cell) {
  const empty = !cell || ((cell.v ?? '') === '' && !hasStyle(cell.s));
  return { [cellKey(sheetId, address)]: empty ? null : { v: String(cell.v ?? ''), ...(hasStyle(cell.s) ? { s: cell.s } : {}) } };
}

function hasStyle(s) {
  return Boolean(s && Object.values(s).some((v) => v && v !== 'general'));
}

export function uniqueSheetName(book, base = 'Sheet') {
  const taken = new Set(book.sheets.map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}${n}`.toLowerCase())) return `${base}${n}`;
}

export function addSheet(book, name) {
  const sheet = makeSheet(uniqueSheetName(book, name || `Sheet${book.sheets.length + 1}`));
  return { book: { ...book, sheets: [...book.sheets, sheet] }, sheet };
}

export function renameSheet(book, sheetId, name) {
  const clean = String(name || '').replace(/[[\]*?/\\:']/g, '').trim().slice(0, 31);
  if (!clean || book.sheets.some((s) => s.id !== sheetId && s.name.toLowerCase() === clean.toLowerCase())) return book;
  return { ...book, sheets: book.sheets.map((s) => (s.id === sheetId ? { ...s, name: clean } : s)) };
}

/** Remove a sheet and its cells: returns the window patch. */
export function removeSheetPatch(win, book, sheetId) {
  if (book.sheets.length < 2) return {};
  const patch = {};
  for (const [key, value] of Object.entries(clearParts(win, PART.cell))) {
    if (key.startsWith(`${PART.cell}.${sheetId}.`)) patch[key] = value;
  }
  return { ...patch, officeBook: { ...book, sheets: book.sheets.filter((s) => s.id !== sheetId) } };
}

export function updateSheet(book, sheetId, change) {
  return { ...book, sheets: book.sheets.map((s) => (s.id === sheetId ? { ...s, ...change } : s)) };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function serialToIso(serial) {
  const d = serialToDate(serial);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** What a computed value looks like in a cell. */
export function formatValue(value, fmt = 'general') {
  if (value === null || value === undefined) return '';
  if (isErr(value)) return value.err;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value !== 'number') return String(value);
  switch (fmt) {
    case 'number': return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'currency': return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent': return `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    case 'date': return serialToIso(value);
    default: return formatGeneral(value);
  }
}
