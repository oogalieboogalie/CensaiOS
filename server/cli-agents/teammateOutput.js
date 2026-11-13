import { DIFF_HEADER, diffWithoutSecrets } from '../security/secretFiles.js';
import { UNKNOWN_DIFF } from '../../shared/files/fileProblems.js';

// A coding agent's printed words as a teammate watching its task sees them,
// given `ownerOnly`, which says whether a path is to a file only this
// computer's owner opens (server/cli-agents/ownerOnlySteps.js). Left out of a
// step's output: a line from such a file (grep's "path:12:words",
// "path-12-words", "path:words" and "path-words", git grep's
// "HEAD:path:12:words"), the lines under a heading for one (rg's "path",
// OpenCode's "path:", Gemini's "File: path", head's and tail's "==> path <==",
// diff's "diff -r a/path b/path"), a diff of one however git spells it, a diff
// that does not say which file it is of, and the password or token in a link
// (https://user:token@host). What an agent says is judged less loosely: a line
// is cut only after a start with no spaces that a line number follows, as a
// quoted search line has, and a hunk it quotes with no file's name is left out
// on its own. The worktree's own folder is taken out of paths first, so it is
// never judged (it sits in a hidden folder itself).

const ESC = String.fromCharCode(27);
// Colour codes some git settings add, which would hide a diff's header.
const COLOURS = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
// A hunk of a unified diff, at the start of a line or after git log --graph's "| ".
const HUNK = /^[|/\\* ]*@@+ -\d/m;
const HUNK_LINE = new RegExp(HUNK.source);
// The lines such a hunk goes on with: +, - and space lines, "\ No newline", empty lines and --graph's.
const HUNK_GOES_ON = /^(?:[ +\-\\|/*]|$)/;
// A link's user and password, or its token: https://user:pass@host, https://token@host.
const LINK_LOGIN = /\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@'"`]+@/gi;
// One file's heading: rg's "path", OpenCode's "path:" (a name is judged up to a ":"), Gemini's "File: path".
const headingOf = (line) => line.trim().replace(/^File:\s*/, '');
// A line under it: "12:words", "12-words", "  Line 12: words", "L12: words".
const NUMBERED = /^\s*(?:Line\s+|L)?\d+[:-]/;
// head's and tail's heading over each file they print.
const PRINTED = /^==> (.+) <==$/;
// diff's heading over each two files it compares in two folders (diff -r), in any of its formats.
const FILE_PAIR = /^diff (?!--(?:git|cc|combined) )(.+)$/;
// A path is judged up to each of the first few ":" or "-" in a line's first characters.
const MAX_START = 1024;
const MAX_ENDS = 64;
// A diff's own lines below a file's "diff --git" line, which diffWithoutSecrets
// has judged by that file: the lines git puts under it, each hunk's header, and
// in a merge's combined diff, lines with a +, - or space for each parent.
const DIFF_FILE_LINE = /^(?:diff --(?:git|cc|combined) |index |--- |\+\+\+ |(?:new|deleted) file mode |old mode |new mode |(?:dis)?similarity index |(?:rename|copy) (?:from|to) |Binary files )/;
const HUNK_COUNTS = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const MERGE_HUNK = /^(@{3,}) -\d/;

/** "HEAD:path" and "path:12" judged part by part; "C:\path" keeps its drive letter. */
export const colonParts = (text) => text.split(/(?<!^[A-Za-z]):/);

/** Words with the password or token taken out of each link in them. */
export const withoutLinkLogins = (words) => String(words).replace(LINK_LOGIN, '$1…@');

/** `words` without the worktree's own folder, only where a path starts: git's "a/" before an absolute path keeps it, so that path is judged whole. */
export function withoutRoot(words, root) {
  if (!root) return words;
  return words.replace(new RegExp(`(?<![\\w.-])${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/]`, 'g'), '');
}

/**
 * `text` without what changed in a file only the owner opens, nor in a part of
 * a diff that does not say which file it is of: in output, all that follows
 * one; in what an agent says (`said`), the hunk and the lines it goes on with.
 */
function diffForTeammate(text, { said = false } = {}) {
  const start = text.search(DIFF_HEADER);
  const before = start < 0 ? text : text.slice(0, start);
  const after = start < 0 ? '' : diffWithoutSecrets(text.slice(start), { hidden: true });
  if (!said) {
    const hunk = before.search(HUNK);
    return (hunk < 0 ? before : `${before.slice(0, hunk)}${UNKNOWN_DIFF}\n`) + after;
  }
  const kept = [];
  let loose = false;
  before.split('\n').forEach((line, at, lines) => {
    const end = at === lines.length - 1 && line === ''; // after the last newline, kept so a header after it starts a line
    if (!end && HUNK_LINE.test(line)) {
      if (!loose) kept.push(UNKNOWN_DIFF);
      loose = true;
    } else if (end || !loose || !HUNK_GOES_ON.test(line)) {
      loose = false;
      kept.push(line);
    }
  });
  return kept.join('\n') + after;
}

/** Says, line by line, whether a line is a diff's own; a hunk's lines are as many as its "@@ -1,2 +1,3 @@" counts. */
function diffOwnLines() {
  let inFile = false;
  let older = 0; // a hunk's lines still to come, on its old side and on its new side
  let newer = 0;
  let parents = null; // a merge's combined hunk: a +, - or space for each parent
  return (line) => {
    if (inFile && line.startsWith('\\ ')) return true; // "\ No newline at end of file", which a hunk does not count
    const mark = line[0] || ' ';
    if (mark === ' ' && older > 0 && newer > 0) { older -= 1; newer -= 1; return true; }
    if ((mark === '-' && older > 0) || (mark === '+' && newer > 0)) {
      if (mark === '-') older -= 1; else newer -= 1;
      return true;
    }
    older = 0;
    newer = 0;
    if (parents?.test(line)) return true;
    parents = null;
    if (/^diff --(?:git|cc|combined) /.test(line)) inFile = true;
    if (!inFile) return false;
    const counts = HUNK_COUNTS.exec(line);
    if (counts) {
      older = Number(counts[1] ?? 1);
      newer = Number(counts[2] ?? 1);
      return true;
    }
    const merge = MERGE_HUNK.exec(line);
    if (merge) parents = new RegExp(`^[ +-]{${merge[1].length - 1}}`);
    return Boolean(merge) || DIFF_FILE_LINE.test(line);
  };
}

/**
 * The shortest start of `line`, up to a ":" or "-", that names a file only the
 * owner opens ("./.env" of "./.env-3-words"), or ''. `said`: only a start with
 * no spaces, followed by a line number, as an agent quoting a search would put it.
 */
function ownerOnlyStart(line, ownerOnly, { said = false } = {}) {
  const head = line.slice(0, MAX_START);
  const judged = new Set(); // the parts an earlier start already had, none of them such a file
  const names = (part) => {
    const text = part.trim();
    if (!text || judged.has(text)) return false;
    judged.add(text);
    return ownerOnly(text);
  };
  let ends = 0;
  for (let at = 0; at < head.length && ends < MAX_ENDS; at += 1) {
    if (head[at] !== ':' && head[at] !== '-') continue;
    ends += 1;
    const start = head.slice(0, at).trim();
    if (!start || (said && (/\s/.test(start) || !/^[:-]\d+[:-]/.test(head.slice(at))))) continue;
    if ([start, ...colonParts(start)].some(names)) return start;
  }
  return '';
}

/**
 * `text` as a teammate sees it: a step's output (`said` false), or what the
 * agent said (`said` true). `root` is the task's worktree.
 */
export function wordsForTeammate(text, { root = '', ownerOnly, said = false }) {
  const words = withoutRoot(withoutLinkLogins(String(text).replace(COLOURS, '')), root);
  const diffLine = diffOwnLines();
  let under = false; // below a heading for such a file its numbered lines are its words, and "--" between them keeps it
  let printed = false; // below head's, tail's or diff's heading for one, every line is its words
  return diffForTeammate(words, { said }).split('\n').map((line) => {
    const own = diffLine(line);
    const heading = !own && (PRINTED.exec(line.trim()) || FILE_PAIR.exec(line));
    if (heading) {
      printed = heading[0].startsWith('diff ') ? heading[1].split(/\s+/).some((word) => ownerOnly(word)) : ownerOnly(heading[1]);
      under = false;
      return line;
    }
    if (printed) return '…';
    if (own) {
      under = false;
      // A line a cut-short hunk still seemed to count may be a search line, so one that names such a file is cut all the same.
      const from = /^[ +-]/.test(line) && ownerOnlyStart(line.slice(1), ownerOnly, { said: true });
      return from ? `${line[0]}${from}: …` : line;
    }
    if (under && NUMBERED.test(line)) return '…';
    if (under && /^-{2,3}$/.test(line.trim())) return line;
    under = !NUMBERED.test(line) && ownerOnly(headingOf(line));
    const from = ownerOnlyStart(line, ownerOnly, { said });
    return from ? `${from}: …` : line;
  }).join('\n');
}

/** The lines of `text` (without its colours and the worktree's folder) that a teammate does not see in wordsForTeammate's version of it. */
export function linesCut(text, options) {
  const shown = new Set(wordsForTeammate(text, options).split('\n'));
  return withoutRoot(String(text).replace(COLOURS, ''), options.root).split('\n').filter((line) => !shown.has(line));
}
