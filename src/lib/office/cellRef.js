// A1-style cell addresses for Censai Sheets. Columns and rows are 0-based
// internally; addresses are the familiar "B7" form. Pure, no React.

export function colName(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function colIndex(name) {
  let n = 0;
  for (const ch of String(name).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function addr(col, row) {
  return `${colName(col)}${row + 1}`;
}

const ADDR_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/;

/** "B7" -> { col: 1, row: 6 }, or null. Accepts $ anchors. */
export function parseAddr(text) {
  const m = ADDR_RE.exec(String(text || '').trim());
  if (!m) return null;
  return { col: colIndex(m[1]), row: Number(m[2]) - 1 };
}

/** "A1:C3" (or a single "B2") -> normalized { c1, r1, c2, r2 }, or null. */
export function parseRange(text) {
  const [a, b] = String(text || '').split(':');
  const start = parseAddr(a);
  const end = b === undefined ? start : parseAddr(b);
  if (!start || !end) return null;
  return {
    c1: Math.min(start.col, end.col), r1: Math.min(start.row, end.row),
    c2: Math.max(start.col, end.col), r2: Math.max(start.row, end.row),
  };
}

export function rangeText({ c1, r1, c2, r2 }) {
  const a = addr(c1, r1);
  const b = addr(c2, r2);
  return a === b ? a : `${a}:${b}`;
}

/** Every address in a range, row by row. */
export function rangeAddrs({ c1, r1, c2, r2 }) {
  const out = [];
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) out.push(addr(c, r));
  return out;
}
