// Pure helpers for AI pull-request reviews: the CI reviewers (scripts/ai-review.mjs)
// and the GitHub window's review team (server/github/reviewTeam.js).
// No network, no git: everything here is unit-tested in scripts/ai-review.test.js.
import { createHash } from 'node:crypto';

export const PROVIDERS = {
  claude: { label: 'Claude review', secret: 'ANTHROPIC_API_KEY' },
  openai: { label: 'ChatGPT review', secret: 'OPENAI_API_KEY' },
};

// Files a reviewer never needs to read: lockfiles, build output, binaries.
export const SKIP_PATTERNS = [
  /(^|\/)package-lock\.json$/, /(^|\/)Cargo\.lock$/, /(^|\/)yarn\.lock$/, /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist(-[a-z]+)?\//, /(^|\/)node_modules\//, /\.min\.(js|css)$/, /\.snap$/,
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|woff2?|ttf|mp3|mp4|webm|wasm)$/i,
];

export const SEVERITIES = ['high', 'medium', 'low'];

export const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'line', 'end_line', 'severity', 'title', 'explanation', 'suggestion', 'pattern'],
        properties: {
          path: { type: 'string' },
          line: { type: 'integer' },
          end_line: { type: 'integer' },
          severity: { type: 'string', enum: SEVERITIES },
          title: { type: 'string' },
          explanation: { type: 'string' },
          suggestion: { type: 'string' },
          pattern: { type: 'string' },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You review pull requests for censaiOS (repo Homebase): a React infinite-canvas
front end (src/) and a Node/Express + Postgres back end (server/). Find real defects in the
changed code: wrong logic, crashes, unhandled errors, race conditions, security holes (injection,
leaked secrets, missing auth or tenant checks), data loss, broken API contracts, and tests that do
not test what they claim. Report every real defect you find, including ones you are only fairly
sure about; say how sure you are in the explanation.
Do NOT report style, naming, formatting, missing comments, or "consider refactoring" ideas.
Each finding names the file path and a line number on the new side of the diff (a + or unchanged
line inside a hunk) plus the last line it covers (end_line, same as line for one line), a severity (high = breaks users or security, medium = a real bug in a less
common path, low = a minor real bug), a one-line title, why it is wrong, a concrete fix, and the
general bug pattern in a few plain words (for example "array index read before length check").
The summary is two or three plain sentences a non-programmer can read: what the change does and
whether it looks safe to merge. Return no findings when you find no real defects.`;

/** sha256 of the diff, shortened: lets a re-run skip a diff it already reviewed. */
export function diffHash(diff) {
  return createHash('sha256').update(diff).digest('hex').slice(0, 16);
}

/** Splits a unified diff into per-file chunks: [{ path, text }]. */
export function splitDiff(diff) {
  const files = [];
  for (const chunk of diff.split(/^(?=diff --git )/m)) {
    if (!chunk.startsWith('diff --git ')) continue;
    const plus = chunk.match(/^\+\+\+ b\/(.+)$/m);
    const header = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const path = plus ? plus[1] : header ? header[2] : '';
    files.push({ path, text: chunk });
  }
  return files;
}

/**
 * Drops skipped files and caps size so a review's cost stays predictable.
 * Returns { diff, skipped: [paths], truncated: [paths] }.
 */
export function prepareDiff(diff, { maxChars = 120000, maxFileChars = 20000 } = {}) {
  const skipped = [];
  const truncated = [];
  let out = '';
  for (const file of splitDiff(diff)) {
    if (SKIP_PATTERNS.some((re) => re.test(file.path))) { skipped.push(file.path); continue; }
    let text = file.text;
    if (text.length > maxFileChars) {
      text = `${text.slice(0, maxFileChars)}\n[... rest of this file's diff left out to cap cost ...]\n`;
      truncated.push(file.path);
    }
    if (out.length + text.length > maxChars) { skipped.push(file.path); continue; }
    out += text;
  }
  return { diff: out, skipped, truncated };
}

/** Map of path -> Set of new-side line numbers that GitHub accepts inline comments on. */
export function commentableLines(diff) {
  const map = new Map();
  for (const file of splitDiff(diff)) {
    const lines = new Set();
    let next = 0;
    let inHunk = false;
    for (const row of file.text.split('\n')) {
      const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) { next = Number(hunk[1]); inHunk = true; continue; }
      if (!inHunk || row.startsWith('\\')) continue;
      if (row.startsWith('+')) { lines.add(next); next += 1; }
      else if (row.startsWith(' ')) { lines.add(next); next += 1; }
      // '-' rows exist only on the old side.
    }
    map.set(file.path, lines);
  }
  return map;
}

/** Keeps well-formed findings, sorted most severe first. */
export function cleanFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings
    .filter((f) => f && typeof f.path === 'string' && Number.isInteger(f.line) && SEVERITIES.includes(f.severity))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}

/** Splits findings into inline comments (on a diff line) and the rest (listed in the summary). */
export function placeFindings(findings, lines) {
  const inline = [];
  const elsewhere = [];
  for (const f of findings) {
    if (lines.get(f.path)?.has(f.line)) inline.push(f);
    else elsewhere.push(f);
  }
  return { inline, elsewhere };
}

const BADGE = { high: '🔴 High', medium: '🟠 Medium', low: '🟡 Low' };

/** Machine-readable record of one review, kept as a workflow artifact for a later bug memory. */
export function findingsRecord({ provider, model, repo, pr, head, hash, findings }) {
  return {
    version: 1, provider, model, repo, pr: Number(pr), head, diff: hash, reviewed_at: new Date().toISOString(),
    findings: findings.map((f) => ({
      path: f.path, line: f.line, end_line: Number.isInteger(f.end_line) && f.end_line >= f.line ? f.end_line : f.line,
      severity: f.severity, summary: f.title, pattern: f.pattern || '',
    })),
  };
}

export function formatFinding(f) {
  const fix = f.suggestion ? `\n\n**Fix:** ${f.suggestion}` : '';
  return `**${BADGE[f.severity]}: ${f.title}**\n\n${f.explanation}${fix}`;
}

export function marker(provider, hash) {
  return `<!-- ai-review:${provider} diff:${hash} -->`;
}

/** Finds the diff hash this provider last reviewed, from earlier review bodies. */
export function lastReviewedHash(reviewBodies, provider) {
  const re = new RegExp(`<!-- ai-review:${provider} diff:([0-9a-f]+) -->`);
  let hash = null;
  for (const body of reviewBodies) {
    const m = typeof body === 'string' && body.match(re);
    if (m) hash = m[1];
  }
  return hash;
}

/** The review summary body: verdict, counts, findings that could not go inline, cost note. */
export function formatSummary({ provider, model, result, inline, elsewhere, prepared, hash, usage }) {
  const total = inline.length + elsewhere.length;
  const counts = SEVERITIES.map((s) => [s, [...inline, ...elsewhere].filter((f) => f.severity === s).length])
    .filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`).join(', ');
  const parts = [`## ${PROVIDERS[provider].label}`, '', result.summary || '(no summary)', ''];
  parts.push(total === 0 ? '**No real bugs found.**' : `**${total} possible bug${total === 1 ? '' : 's'}** (${counts}).`);
  if (elsewhere.length) {
    parts.push('', 'Not on a changed line, so listed here:');
    for (const f of elsewhere) parts.push('', `\`${f.path}:${f.line}\` ${formatFinding(f)}`);
  }
  const notes = [];
  if (prepared.skipped.length) notes.push(`skipped ${prepared.skipped.length} file(s) (lockfiles, build output, or over the size cap)`);
  if (prepared.truncated.length) notes.push(`read only the start of ${prepared.truncated.length} large file diff(s)`);
  if (usage) notes.push(`${usage.input} tokens in, ${usage.output} out`);
  parts.push('', `<sub>${model}${notes.length ? ` · ${notes.join(' · ')}` : ''} · bugs only, no style notes</sub>`);
  parts.push(marker(provider, hash));
  return parts.join('\n');
}
