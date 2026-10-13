// CSV in and out for Censai Sheets (RFC 4180 quoting, comma, semicolon or
// tab separated on the way in). Pure, no React.
import { addr, parseAddr } from './cellRef.js';
import { cellPatch, formatValue } from './sheetBook.js';
import { isFormula } from './sheetEval.js';

/** The used area of a sheet: { rows, cols } counts (0 when empty). */
export function usedSize(sheetCells = {}) {
  let rows = 0;
  let cols = 0;
  for (const [address, cell] of Object.entries(sheetCells)) {
    if ((cell?.v ?? '') === '') continue;
    const p = parseAddr(address);
    if (!p) continue;
    rows = Math.max(rows, p.row + 1);
    cols = Math.max(cols, p.col + 1);
  }
  return { rows, cols };
}

function quote(text) {
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The computed values of one sheet as CSV text. */
export function sheetToCsv(sheetId, sheetCells, calc) {
  const { rows, cols } = usedSize(sheetCells);
  const lines = [];
  for (let r = 0; r < rows; r += 1) {
    const out = [];
    for (let c = 0; c < cols; c += 1) {
      const address = addr(c, r);
      const value = calc.value(sheetId, address);
      const fmt = sheetCells[address]?.s?.fmt;
      const text = typeof value === 'number' && (!fmt || fmt === 'general') ? String(value) : formatValue(value, fmt === 'date' ? 'date' : 'general');
      out.push(quote(text));
    }
    lines.push(out.join(','));
  }
  return lines.join('\r\n');
}

function detectDelimiter(text) {
  const head = text.split(/\r?\n/, 5).join('\n');
  const counts = [',', ';', '\t'].map((d) => [d, head.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

/** CSV text -> rows of strings. */
export function parseCsv(input) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * A patch writing rows of text into a sheet from a top-left cell. Imported
 * text that looks like a formula is kept as text (a leading ').
 */
export function gridPatch(sheetId, grid, { col = 0, row = 0, keepFormulas = false } = {}) {
  const patch = {};
  grid.forEach((cells, r) => cells.forEach((value, c) => {
    const v = String(value ?? '');
    const safe = !keepFormulas && isFormula(v) ? `'${v}` : v;
    Object.assign(patch, cellPatch(sheetId, addr(col + c, row + r), safe === '' ? null : { v: safe }));
  }));
  return patch;
}
