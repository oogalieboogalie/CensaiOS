// The board spreadsheet: a small grid kept in window state (win.sheet), so it
// syncs through Yjs like any other window. Pure helpers, no React.
//
//   sheet   { columns: [{ id, name, research? }], rows: [{ id, cells }] }
//   research column  { prompt, from }: per row, search the web for the value
//                    in column `from` plus the prompt, and fill this column
//   cell    { v, src?, srcTitle?, status? }  status: working | done | not found | failed

let seq = 0;
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function colLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function makeSheet({ columns = ['Company', 'Notes'], rows = 8 } = {}) {
  return {
    columns: columns.map((name, i) => ({ id: `c${i}`, name })),
    rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, cells: {} })),
  };
}

export function normalizeSheet(sheet) {
  if (!sheet || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) return makeSheet();
  return sheet;
}

export function cellValue(row, colId) {
  return String(row?.cells?.[colId]?.v ?? '');
}

export function setCell(sheet, rowId, colId, patch) {
  return {
    ...sheet,
    rows: sheet.rows.map((row) => (row.id !== rowId ? row : {
      ...row, cells: { ...row.cells, [colId]: { ...(row.cells?.[colId] || {}), ...patch } },
    })),
  };
}

export function addColumn(sheet, { name, research = null } = {}) {
  const column = { id: newId('c'), name: String(name || colLetter(sheet.columns.length)).slice(0, 60) };
  if (research?.prompt) column.research = { prompt: String(research.prompt).slice(0, 300), from: research.from || sheet.columns[0]?.id };
  return { ...sheet, columns: [...sheet.columns, column] };
}

export function removeColumn(sheet, colId) {
  return {
    columns: sheet.columns.filter((c) => c.id !== colId),
    rows: sheet.rows.map((row) => {
      const { [colId]: _gone, ...cells } = row.cells || {};
      return { ...row, cells };
    }),
  };
}

export function addRows(sheet, count = 1) {
  return { ...sheet, rows: [...sheet.rows, ...Array.from({ length: count }, () => ({ id: newId('r'), cells: {} }))] };
}

/** Paste tab/newline separated text starting at a cell, growing rows as needed. */
export function pasteGrid(sheet, rowId, colId, text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const grid = lines.map((line) => line.split('\t'));
  const startRow = sheet.rows.findIndex((r) => r.id === rowId);
  const startCol = sheet.columns.findIndex((c) => c.id === colId);
  if (startRow < 0 || startCol < 0) return sheet;
  let next = sheet;
  const missing = startRow + grid.length - next.rows.length;
  if (missing > 0) next = addRows(next, missing);
  grid.forEach((cells, r) => {
    cells.forEach((value, c) => {
      const col = next.columns[startCol + c];
      if (col) next = setCell(next, next.rows[startRow + r].id, col.id, { v: value.trim(), src: null, srcTitle: null, status: null });
    });
  });
  return next;
}

/** Rows a research column should fill: a value to look up, nothing there yet. */
export function rowsToFill(sheet, column, { overwrite = false } = {}) {
  if (!column?.research?.from) return [];
  return sheet.rows.filter((row) => cellValue(row, column.research.from).trim()
    && (overwrite || !cellValue(row, column.id).trim()));
}

export function toTsv(sheet) {
  const head = sheet.columns.map((c) => c.name).join('\t');
  const body = sheet.rows.filter((row) => sheet.columns.some((c) => cellValue(row, c.id)))
    .map((row) => sheet.columns.map((c) => cellValue(row, c.id).replace(/[\t\n]/g, ' ')).join('\t'));
  return [head, ...body].join('\n');
}
