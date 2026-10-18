import { parsePatch } from '../src/components/agentConsole/lineDiff.js';
import { rowsFromHunks, rowsFromTexts, countRows } from '../src/components/diffViewer/sideBySide.js';

describe('Git Diff Viewer side-by-side rows', () => {
  test('a git patch becomes level before/after rows with real line numbers', () => {
    const patch = [
      'diff --git a/app.js b/app.js',
      '@@ -10,3 +10,3 @@ function hello()',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      ' return a + b;',
    ].join('\n');
    const rows = rowsFromHunks(parsePatch(patch)[0].hunks);
    expect(rows[0]).toEqual({ type: 'gap', label: 'Line 10 · function hello()' });
    expect(rows[1]).toEqual({ type: 'same', left: { n: 10, text: 'const a = 1;' }, right: { n: 10, text: 'const a = 1;' } });
    // Removed: shown on the left as it was, and in red on the right with no new line number.
    expect(rows[2]).toEqual({ type: 'del', left: { n: 11, text: 'const b = 2;' }, right: { n: null, text: 'const b = 2;' } });
    // Added: blank on the left, green on the right.
    expect(rows[3]).toEqual({ type: 'add', left: null, right: { n: 11, text: 'const b = 3;' } });
    expect(rows[4].left.n).toBe(12);
    expect(rows[4].right.n).toBe(12);
    expect(countRows(rows)).toEqual({ add: 1, del: 1 });
  });

  test('two pasted versions compare line by line', () => {
    const rows = rowsFromTexts('one\ntwo\nthree', 'one\nTWO\nthree\nfour');
    expect(rows.map((r) => r.type)).toEqual(['same', 'del', 'add', 'same', 'add']);
    expect(countRows(rows)).toEqual({ add: 2, del: 1 });
    expect(rows[4].right).toEqual({ n: 4, text: 'four' });
  });

  test('nothing pasted gives no rows', () => {
    expect(rowsFromTexts('', '')).toEqual([]);
  });
});
