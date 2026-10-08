// Small line diff for inline edit cards (before/after strings from the CLI)
// and a parser for unified patches (git diff) for the Changes tab.

const MAX_LCS_LINES = 400;

/** [{ type: 'same'|'del'|'add', text }] using an LCS table; falls back to del-all/add-all for big inputs. */
export function diffLines(before = '', after = '') {
  const a = before ? String(before).split('\n') : [];
  const b = after ? String(after).split('\n') : [];
  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) {
    return [...a.map((text) => ({ type: 'del', text })), ...b.map((text) => ({ type: 'add', text }))];
  }
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i += 1; }
    else { out.push({ type: 'add', text: b[j] }); j += 1; }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] });
  while (j < b.length) out.push({ type: 'add', text: b[j++] });
  return out;
}

/** Split a unified patch into files with hunks of typed lines. */
export function parsePatch(patch = '') {
  const files = [];
  let file = null;
  let hunk = null;
  for (const line of String(patch).split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      file = { path: m ? m[2] : line.slice(11), hunks: [], binary: false };
      files.push(file);
      hunk = null;
    } else if (!file) {
      continue;
    } else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      file.binary = true;
    } else if (line.startsWith('@@')) {
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (hunk && !file.binary) {
      if (line.startsWith('+')) hunk.lines.push({ type: 'add', text: line.slice(1) });
      else if (line.startsWith('-')) hunk.lines.push({ type: 'del', text: line.slice(1) });
      else if (line.startsWith(' ')) hunk.lines.push({ type: 'same', text: line.slice(1) });
    }
  }
  return files;
}
