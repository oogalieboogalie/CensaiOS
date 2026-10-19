// Review team helpers: the prompt each coding CLI gets, reading its answer
// back, and merging several reviewers' findings into one list. Pure; tested in
// tests/github/reviewTeam.test.js.
import { SEVERITIES, cleanFindings, formatFinding } from './reviewCore.js';

export const NEAR_LINES = 3;

export const DIFF_FILE = '.censai-review/pr.diff';

export function buildReviewPrompt({ pr, repo, files = [], skipped = [] }) {
  return [
    `Review pull request #${pr.number} "${pr.title}" in ${repo} for real bugs.`,
    `This folder is checked out at the PR's latest commit (branch ${pr.headRef}). The full change against ${pr.baseRef} is in the file ${DIFF_FILE}: read it first, then read any other file you need for context.`,
    files.length ? `Changed files: ${files.slice(0, 40).join(', ')}${files.length > 40 ? ` and ${files.length - 40} more` : ''}.` : '',
    skipped.length ? `Left out of the diff file to keep it short (lockfiles, build output, very large files): ${skipped.slice(0, 20).join(', ')}.` : '',
    '',
    'Look for wrong logic, crashes, unhandled errors, race conditions, security holes (injection, leaked secrets, missing auth or permission checks), data loss, broken API contracts, and tests that do not test what they claim.',
    'Report every real bug, including ones you are only fairly sure about, and say how sure you are. Do NOT report style, naming, formatting or refactoring ideas.',
    'This is a read-only review: do not edit, create or delete any file and do not run commands that change anything.',
    '',
    'End your answer with exactly one fenced ```json block shaped like this:',
    '{"summary": "two or three plain sentences: what the change does and whether it looks safe to merge",',
    ' "findings": [{"path": "src/file.js", "line": 42, "end_line": 44, "severity": "high|medium|low", "title": "one line",',
    '   "explanation": "why it is wrong", "suggestion": "a concrete fix", "pattern": "the general bug pattern in a few plain words"}]}',
    'Line numbers are on the new side of the diff. Use an empty findings list when you find no real bugs.',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}

/** Pulls the {summary, findings} object out of a CLI's final answer. */
export function parseReviewText(text) {
  const source = String(text || '');
  const fenced = [...source.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.reverse();
  const lastBrace = source.lastIndexOf('{"summary"');
  if (lastBrace >= 0) candidates.push(source.slice(lastBrace));
  for (const raw of candidates) {
    try {
      const data = JSON.parse(raw.trim());
      if (data && typeof data === 'object' && Array.isArray(data.findings)) {
        return { summary: String(data.summary || ''), findings: cleanFindings(data.findings) };
      }
    } catch { /* try the next candidate */ }
  }
  return null;
}

const rank = (s) => SEVERITIES.indexOf(s);

/**
 * Merge per-reviewer findings: same file and lines within NEAR_LINES count as
 * one issue. Each merged finding keeps the most severe rating and lists who
 * found it, so "found by 3 reviewers" floats to the top.
 * input: [{ reviewer: 'Claude Code', findings: [...] }]
 */
export function mergeFindings(perReviewer) {
  const merged = [];
  for (const { reviewer, findings } of perReviewer) {
    for (const f of findings || []) {
      const twin = merged.find((m) => m.path === f.path && Math.abs(m.line - f.line) <= NEAR_LINES && !m.reviewers.includes(reviewer));
      if (twin) {
        twin.reviewers.push(reviewer);
        if (rank(f.severity) < rank(twin.severity)) Object.assign(twin, { line: f.line, end_line: f.end_line, severity: f.severity, title: f.title, explanation: f.explanation, suggestion: f.suggestion });
        twin.notes.push({ reviewer, title: f.title, explanation: f.explanation });
      } else {
        merged.push({ ...f, reviewers: [reviewer], notes: [] });
      }
    }
  }
  return merged.sort((a, b) => (b.reviewers.length - a.reviewers.length) || (rank(a.severity) - rank(b.severity)));
}

export function formatTeamFinding(f) {
  const who = f.reviewers.length > 1 ? `Found by ${f.reviewers.length} reviewers: ${f.reviewers.join(', ')}.` : `Found by ${f.reviewers[0]}.`;
  const also = f.notes.map((n) => `\n\n*${n.reviewer}:* ${n.explanation}`).join('');
  return `${formatFinding(f)}\n\n<sub>${who}</sub>${also}`;
}

/** The summary body of the one GitHub review the team posts. */
export function formatTeamSummary({ reviewers, summaries, inline, elsewhere }) {
  const total = inline.length + elsewhere.length;
  const parts = ['## Review team', '', `Reviewed by ${reviewers.join(', ')}, each on its own sign-in.`, ''];
  for (const s of summaries) parts.push(`**${s.reviewer}:** ${s.summary || '(no summary)'}`, '');
  parts.push(total === 0 ? '**No real bugs found.**' : `**${total} possible bug${total === 1 ? '' : 's'}**, most agreed-on first.`);
  if (elsewhere.length) {
    parts.push('', 'Not on a changed line, so listed here:');
    for (const f of elsewhere) parts.push('', `\`${f.path}:${f.line}\` ${formatTeamFinding(f)}`);
  }
  parts.push('', '<sub>Posted from censaiOS. Bugs only, no style notes.</sub>');
  return parts.join('\n');
}
