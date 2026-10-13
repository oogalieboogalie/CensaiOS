// State and actions for one Censai Sheets window. The workbook outline and
// every cell live in board state (synced); which sheet you look at, the
// selection and the cell you are typing in stay local to you.
import React from 'react';
import { addr, parseAddr, rangeAddrs, rangeText } from '../../../lib/office/cellRef.js';
import {
  MAX_COLS, MAX_ROWS, addSheet, cellPatch, normalizeBook, readCells, removeSheetPatch, renameSheet, updateSheet,
} from '../../../lib/office/sheetBook.js';
import { evaluateBook } from '../../../lib/office/sheetEval.js';
import { gridPatch, parseCsv } from '../../../lib/office/sheetCsv.js';
import { formatValue } from '../../../lib/office/sheetBook.js';
import { newPartId } from '../../../lib/office/officeParts.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function useSheet(win, onUpdate) {
  const book = React.useMemo(() => normalizeBook(win.officeBook), [win.officeBook]);
  const cells = React.useMemo(() => readCells(win), [win]);
  const calc = React.useMemo(() => evaluateBook(book, cells), [book, cells]);
  const [activeId, setActiveId] = React.useState(book.sheets[0].id);
  const sheet = book.sheets.find((s) => s.id === activeId) || book.sheets[0];
  const sheetCells = cells[sheet.id] || {};
  const [sel, setSel] = React.useState({ c1: 0, r1: 0, c2: 0, r2: 0, ac: 0, ar: 0 });
  const [edit, setEditState] = React.useState(null); // { address, value }
  const editRef = React.useRef(null);
  const setEdit = (next) => { editRef.current = next; setEditState(next); };

  const active = addr(sel.ac, sel.ar);
  const cellAt = (address) => sheetCells[address] || null;
  const display = (address) => formatValue(calc.value(sheet.id, address), cellAt(address)?.s?.fmt);
  const valueAt = (address) => calc.value(sheet.id, address);

  const select = (col, row, extend = false) => {
    const c = clamp(col, 0, sheet.cols - 1);
    const r = clamp(row, 0, sheet.rows - 1);
    setSel((s) => (extend
      ? { ...s, c1: Math.min(s.ac, c), c2: Math.max(s.ac, c), r1: Math.min(s.ar, r), r2: Math.max(s.ar, r) }
      : { c1: c, c2: c, r1: r, r2: r, ac: c, ar: r }));
  };
  const moveBy = (dc, dr, extend) => {
    if (!extend) { select(sel.ac + dc, sel.ar + dr); return; }
    const edgeC = sel.c1 === sel.ac ? sel.c2 : sel.c1;
    const edgeR = sel.r1 === sel.ar ? sel.r2 : sel.r1;
    select(edgeC + dc, edgeR + dr, true);
  };

  const writeRaw = (address, raw) => {
    const prev = cellAt(address);
    onUpdate?.(cellPatch(sheet.id, address, { v: raw, s: prev?.s }));
  };
  const startEdit = (initial, from = 'cell') => setEdit({ address: active, from, value: initial ?? (cellAt(active)?.v || '') });
  const commitEdit = (dc = 0, dr = 1) => {
    const edit = editRef.current;
    if (!edit) return;
    if (edit.value !== (cellAt(edit.address)?.v || '')) writeRaw(edit.address, edit.value);
    setEdit(null);
    const p = parseAddr(edit.address);
    if (p && (dc || dr)) select(p.col + dc, p.row + dr);
  };
  const selAddrs = () => rangeAddrs(sel);

  const clearSelection = () => {
    const patch = {};
    for (const a of selAddrs()) if (cellAt(a)) Object.assign(patch, cellPatch(sheet.id, a, { v: '', s: cellAt(a)?.s }));
    onUpdate?.(patch);
  };
  /** Toggle (or set) one style key across the selection. */
  const style = (key, value) => {
    const on = value !== undefined ? value : !cellAt(active)?.s?.[key];
    const patch = {};
    for (const a of selAddrs()) {
      const prev = cellAt(a) || { v: '' };
      const s = { ...(prev.s || {}), [key]: on };
      if (!on || on === 'general') delete s[key];
      Object.assign(patch, cellPatch(sheet.id, a, { v: prev.v, s }));
    }
    onUpdate?.(patch);
  };

  const copyText = () => {
    const lines = [];
    for (let r = sel.r1; r <= sel.r2; r += 1) {
      const row = [];
      for (let c = sel.c1; c <= sel.c2; c += 1) row.push(display(addr(c, r)));
      lines.push(row.join('\t'));
    }
    return lines.join('\n');
  };
  const pasteText = (text) => {
    const csv = !text.includes('\t') && /\n/.test(text.trim()) && text.includes(',');
    const grid = !csv ? text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t')) : parseCsv(text);
    const rows = Math.min(MAX_ROWS, Math.max(sheet.rows, sel.r1 + grid.length));
    const cols = Math.min(MAX_COLS, Math.max(sheet.cols, sel.c1 + Math.max(...grid.map((r) => r.length))));
    const patch = gridPatch(sheet.id, grid, { col: sel.c1, row: sel.r1, keepFormulas: true });
    if (rows !== sheet.rows || cols !== sheet.cols) patch.officeBook = updateSheet(book, sheet.id, { rows, cols });
    onUpdate?.(patch);
  };

  const setBook = (next) => onUpdate?.({ officeBook: next });
  const sheets = {
    add: () => { const { book: next, sheet: s } = addSheet(book); setBook(next); setActiveId(s.id); },
    rename: (id, name) => setBook(renameSheet(book, id, name)),
    remove: (id) => { onUpdate?.(removeSheetPatch(win, book, id)); if (id === sheet.id) setActiveId(book.sheets.find((s) => s.id !== id)?.id); },
    grow: (rows, cols) => setBook(updateSheet(book, sheet.id, { rows: clamp(sheet.rows + rows, 1, MAX_ROWS), cols: clamp(sheet.cols + cols, 1, MAX_COLS) })),
    width: (col, px) => setBook(updateSheet(book, sheet.id, { widths: { ...(sheet.widths || {}), [col]: clamp(Math.round(px), 40, 600) } })),
    addChart: (type) => setBook(updateSheet(book, sheet.id, { charts: [...(sheet.charts || []), { id: newPartId('ch'), type, range: rangeText(sel), title: '' }] })),
    updateChart: (id, change) => setBook(updateSheet(book, sheet.id, { charts: (sheet.charts || []).map((c) => (c.id === id ? { ...c, ...change } : c)) })),
    removeChart: (id) => setBook(updateSheet(book, sheet.id, { charts: (sheet.charts || []).filter((c) => c.id !== id) })),
  };

  return {
    book, cells, calc, sheet, sheetCells, sel, active, edit, setEdit, setActiveId,
    select, moveBy, startEdit, commitEdit, writeRaw, clearSelection, style, copyText, pasteText, display, valueAt, cellAt, sheets,
  };
}
