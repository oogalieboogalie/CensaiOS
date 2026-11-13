// A Kraken Request starts as a report someone pasted: a review, an audit, a
// list of things to fix. This turns that text into findings, one per thing to
// do. Pure, no database, no model: the same report always gives the same list.
//
// What counts as a finding:
//   - a list item or a "###" heading that starts with how bad it is: "P0",
//     "[P1]", "**High**:", "Critical:"
//   - when no line in the report says how bad it is: every "###" heading and
//     every top-level list item, ranked by the section it sits under
// Lines under a finding are its detail. "Owner: Nexus" names who should get
// it, and "Done when: ..." lines become its checklist.

export const MAX_REPORT_CHARS = 60_000;
export const MAX_FINDINGS = 30;
const MAX_TITLE = 120;
const MAX_BODY = 1400;
const MAX_DONE_WHEN = 5;

export class ReportInputError extends Error {}

const RANK_WORDS = { p0: 'P0', critical: 'P0', blocker: 'P0', p1: 'P1', high: 'P1', p2: 'P2', p3: 'P2', medium: 'P2', low: 'P2' };
// "P1 ..." counts on its own; a word such as "High" only with a mark after it
// ("High: ...", "[High] ...", "High - ..."), so a sentence that starts "High memory use" is not a rank.
const WORDS = 'critical|blocker|high|medium|low';
const TAG = new RegExp(
  `^(?:[[(]?(p[0-3])\\b[\\])]?\\s*[:—–-]*\\s*|[[(](${WORDS})[\\])]\\s*[:—–-]*\\s*|(${WORDS})(?:\\s*:\\s*|\\s+[—–-]\\s+))`,
  'i',
);
const SECTION_RANKS = [
  ['P0', /\b(p0|broken|failing|fails? (?:now|today)|critical|blockers?|fix first)\b/i],
  ['P1', /\b(p1|will fail|at risk|risks?|soon|security|safety)\b/i],
  ['P2', /\b(p2|bloat|debt|clean ?up|hygiene|nice to have|later)\b/i],
];
const OWNER = /^(?:owner|agent|assign(?:ed)? to|who)\s*:\s*(.+)$/i;
const DONE_WHEN = /^(?:done when|proof|prove(?:n)? by|acceptance)\s*:\s*(.*)$/i;
// Bounded on purpose: an unclosed backtick in a long report must not make this slow.
const FILE_REF = /`([\w.\\-]{1,80}(?:\/[\w.\\-]{1,80}){1,12}\.[a-z]{1,5})(?::\d+)?`/gi;
const ITEM_LEVEL = 7; // a list item sits under every heading

/** Lines that can be a finding: a list item, or a heading smaller than a section's. */
const canStart = (line) => Boolean(line.text) && (line.kind === 'item' || (line.kind === 'heading' && line.level >= 3));

const plain = (text) => String(text).replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

function clip(text, max) {
  const flat = String(text ?? '').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function sectionRank(heading) {
  return SECTION_RANKS.find(([, words]) => words.test(heading))?.[0] || null;
}

/** One line of the report: what kind of line it is and its words without the markdown marks. */
function readLine(raw) {
  const heading = raw.match(/^(#{1,6})\s+(.*)$/);
  if (heading) return { kind: 'heading', level: heading[1].length, text: plain(heading[2]) };
  const item = raw.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
  if (item) return { kind: 'item', text: plain(item[1]) };
  return { kind: 'text', text: plain(raw), indented: /^\s/.test(raw) };
}

function tagOf(text) {
  const match = text.match(TAG);
  if (!match) return null;
  const word = (match[1] || match[2] || match[3]).toLowerCase();
  return { severity: RANK_WORDS[word], rest: text.slice(match[0].length).trim() };
}

function finish(finding) {
  const lines = [];
  let listing = false;
  for (const raw of finding.lines) {
    const text = plain(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
    const owner = text.match(OWNER);
    const done = text.match(DONE_WHEN);
    if (owner) {
      finding.owner = clip(owner[1], 40);
      listing = false;
    } else if (done) {
      if (done[1]) finding.doneWhen.push(clip(done[1], 200));
      listing = !done[1];
    } else if (listing && text && /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw)) {
      finding.doneWhen.push(clip(text, 200));
    } else {
      listing = false;
      lines.push(raw.trimEnd());
    }
  }
  const body = lines.join('\n').trim();
  const files = [...new Set([...`${finding.title}\n${body}`.matchAll(FILE_REF)].map((m) => m[1].replace(/\\/g, '/')))].slice(0, 5);
  return {
    severity: finding.severity,
    title: clip(finding.title, MAX_TITLE),
    body: clip(body.replace(/`/g, ''), MAX_BODY),
    owner: finding.owner || null,
    doneWhen: finding.doneWhen.slice(0, MAX_DONE_WHEN),
    files,
  };
}

/**
 * The report as { title, findings, dropped }. findings keep the report's
 * order and are numbered from 1; dropped counts the ones past MAX_FINDINGS.
 * Throws ReportInputError, with words for the person, when there is nothing to hand out.
 */
export function parseReport(text) {
  const report = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!report.trim()) throw new ReportInputError('Paste the report first.');
  if (report.length > MAX_REPORT_CHARS) {
    throw new ReportInputError(`That report is too long (${report.length} characters). Keep it under ${MAX_REPORT_CHARS}, or hand it out in parts.`);
  }
  const lines = report.split('\n').map((raw) => ({ raw, ...readLine(raw) }));
  const tagged = lines.some((line) => canStart(line) && tagOf(line.text)?.rest);
  const found = [];
  let title = '';
  let rank = null;
  let open = null;
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line.raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode || /^\s*\|/.test(line.raw)) {
      if (open) open.lines.push(line.raw);
      continue;
    }
    // A "#" or "##" heading names a section and its rank; it is never a finding itself.
    if (line.kind === 'heading' && line.level <= 2) {
      if (!title && line.level === 1) title = line.text;
      rank = tagOf(line.text)?.severity || sectionRank(line.text);
      open = null;
      continue;
    }
    const tag = canStart(line) ? tagOf(line.text) : null;
    if (canStart(line) && (tagged ? Boolean(tag?.rest) : true)) {
      open = {
        severity: tag?.severity || rank || 'P2', title: tag?.rest || line.text, lines: [], owner: null, doneWhen: [],
        level: line.kind === 'heading' ? line.level : ITEM_LEVEL,
      };
      found.push(open);
    } else if (line.kind === 'heading' && open && line.level <= open.level) {
      open = null; // a heading as big as the finding's own ends it; a smaller one is part of its detail
    } else if (open) open.lines.push(line.raw);
  }
  if (!found.length) {
    throw new ReportInputError('I could not find anything to hand out in that report. Put each thing to fix on its own line, starting with P0, P1 or P2.');
  }
  const findings = found.slice(0, MAX_FINDINGS).map((finding, index) => ({ n: index + 1, ...finish(finding) }));
  return { title: clip(title || findings[0].title, 160), findings, dropped: Math.max(0, found.length - MAX_FINDINGS) };
}
