// Rows for the side-by-side Git Diff Viewer (diagram 16): the left
// column is the file before, the right column is the file after. Removed
// lines stay in place on the right in red so the right reads top to bottom
// as "what changed"; added lines are green there and blank on the left.

import { diffLines } from '../agentConsole/lineDiff.js';

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/** One row per diff line: { type, left: {n, text} | null, right: {n, text} | null }. */
function rowsFromLines(lines, oldStart = 1, newStart = 1) {
  let a = oldStart;
  let b = newStart;
  return lines.map(({ type, text }) => {
    if (type === 'add') return { type, left: null, right: { n: b++, text } };
    if (type === 'del') return { type, left: { n: a++, text }, right: { n: null, text } };
    return { type: 'same', left: { n: a++, text }, right: { n: b++, text } };
  });
}

/** Hunks from parsePatch() → rows, with a 'gap' row naming each hunk. */
export function rowsFromHunks(hunks = []) {
  const rows = [];
  for (const hunk of hunks) {
    const m = String(hunk.header || '').match(HUNK_RE);
    const oldStart = m ? Number(m[1]) : 1;
    const newStart = m ? Number(m[2]) : 1;
    rows.push({ type: 'gap', label: m ? `Line ${newStart}${m[3] ? ` ·${m[3]}` : ''}` : hunk.header });
    rows.push(...rowsFromLines(hunk.lines || [], oldStart, newStart));
  }
  return rows;
}

/** Two pasted versions → rows (whole text, no gaps). */
export function rowsFromTexts(before = '', after = '') {
  return rowsFromLines(diffLines(before, after));
}

/** { add, del } counts for a set of rows. */
export function countRows(rows = []) {
  return rows.reduce((t, r) => ({ add: t.add + (r.type === 'add' ? 1 : 0), del: t.del + (r.type === 'del' ? 1 : 0) }), { add: 0, del: 0 });
}
